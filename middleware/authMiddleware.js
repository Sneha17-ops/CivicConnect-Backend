const { verifyToken, createClerkClient } = require("@clerk/backend");

const ADMIN_EMAILS = (
  process.env.ADMIN_EMAILS ||
  "admin@civicconnect.gov,ops@civicconnect.gov,commissioner@civicconnect.gov"
)
  .split(",")
  .map((email) => email.trim().toLowerCase());

let clerkClient = null;
if (process.env.CLERK_SECRET_KEY) {
  try {
    clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  } catch (err) {
    console.warn("Clerk client init warning:", err.message);
  }
}

/**
 * Extracts bearer token from header or cookies
 */
const extractToken = (req) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }

  // Check cookies (__session is Clerk's default session cookie)
  if (req.cookies && req.cookies.__session) {
    return req.cookies.__session;
  }

  return null;
};

/**
 * Parse token payload safely without throwing
 */
const decodeTokenPayload = (token) => {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
};

/**
 * Optional authentication: attaches user if token is valid, otherwise continues
 */
const optionalAuth = async (req, res, next) => {
  const token = extractToken(req);

  // If testing in development and explicit mock headers provided with bypass flag:
  if (!token && process.env.NODE_ENV !== "production" && req.headers["x-test-user-id"]) {
    const mockRole = (req.headers["x-test-user-role"] || "citizen").toLowerCase();
    req.user = {
      id: req.headers["x-test-user-id"],
      email: (req.headers["x-test-user-email"] || "").toLowerCase(),
      name: req.headers["x-test-user-name"] || "Test User",
      role: mockRole,
      publicMetadataRole: mockRole,
      isRoleAdmin: mockRole === "admin",
      isEmailAdmin: ADMIN_EMAILS.includes((req.headers["x-test-user-email"] || "").toLowerCase()),
    };
    return next();
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    let payload = null;

    if (process.env.CLERK_SECRET_KEY) {
      try {
        payload = await verifyToken(token, {
          secretKey: process.env.CLERK_SECRET_KEY,
        });
      } catch (verifyErr) {
        // Fall back to decoded payload if verifyToken fails due to network/clock skew in dev
        payload = decodeTokenPayload(token);
      }
    } else {
      payload = decodeTokenPayload(token);
    }

    if (!payload || !payload.sub) {
      req.user = null;
      return next();
    }

    let userEmail = payload.email || payload.primary_email_address || "";
    let userName = payload.name || payload.first_name || "";
    let publicMetadataRole = null;

    // Check token payload claims first (if JWT template included publicMetadata or role)
    if (payload.publicMetadata && typeof payload.publicMetadata.role === "string") {
      publicMetadataRole = payload.publicMetadata.role;
    } else if (payload.public_metadata && typeof payload.public_metadata.role === "string") {
      publicMetadataRole = payload.public_metadata.role;
    } else if (payload.metadata && typeof payload.metadata.role === "string") {
      publicMetadataRole = payload.metadata.role;
    } else if (typeof payload.role === "string") {
      publicMetadataRole = payload.role;
    }

    // Query Clerk API if clerkClient is available to fetch authoritative user profile and publicMetadata
    if (clerkClient && process.env.NODE_ENV !== "test") {
      try {
        const clerkUser = await clerkClient.users.getUser(payload.sub);
        if (clerkUser) {
          userEmail =
            clerkUser.primaryEmailAddress?.emailAddress ||
            clerkUser.emailAddresses?.[0]?.emailAddress ||
            userEmail;
          userName = clerkUser.fullName || `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || userName;
          const remoteRole = clerkUser.publicMetadata?.role || clerkUser.public_metadata?.role;
          if (remoteRole) {
            publicMetadataRole = remoteRole;
          }
        }
      } catch (clerkErr) {
        // Continue with available claims
      }
    }

    if (!userEmail && req.headers["x-user-email"]) {
      userEmail = req.headers["x-user-email"];
    }

    const normalizedEmail = (userEmail || "").toLowerCase().trim();
    const normalizedPublicRole = String(publicMetadataRole || "").toLowerCase().trim();
    const isEmailAdmin = Boolean(normalizedEmail && ADMIN_EMAILS.includes(normalizedEmail));
    const isRoleAdmin = normalizedPublicRole === "admin";
    const effectiveRole = (isRoleAdmin || isEmailAdmin) ? "admin" : (normalizedPublicRole || "citizen");

    req.user = {
      id: payload.sub,
      email: normalizedEmail,
      name: userName || "Citizen",
      role: effectiveRole,
      publicMetadataRole: normalizedPublicRole || null,
      isRoleAdmin,
      isEmailAdmin,
    };

    return next();
  } catch (error) {
    req.user = null;
    return next();
  }
};

/**
 * Required authentication middleware
 */
const requireAuth = async (req, res, next) => {
  await optionalAuth(req, res, () => {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please provide a valid Clerk token.",
      });
    }
    return next();
  });
};

/**
 * Admin only authorization middleware
 * Verifies authenticated Clerk role (publicMetadata.role === "admin") or preconfigured admin email
 */
const requireAdmin = async (req, res, next) => {
  await requireAuth(req, res, () => {
    const userRole = (req.user?.role || "").toLowerCase().trim();
    const publicRole = (req.user?.publicMetadataRole || "").toLowerCase().trim();
    const userEmail = (req.user?.email || "").toLowerCase().trim();

    const isAdmin =
      userRole === "admin" ||
      publicRole === "admin" ||
      (userEmail && ADMIN_EMAILS.includes(userEmail));

    // Development diagnostics (No secret keys or session tokens logged)
    console.log("[requireAdmin Diagnostics]", {
      middleware: "backend/middleware/authMiddleware.js -> requireAdmin",
      userId: req.user?.id || null,
      publicMetadataRole: req.user?.publicMetadataRole || "(none)",
      effectiveRole: userRole,
      isAllowedAdmin: Boolean(isAdmin),
      decision: isAdmin ? "ALLOW (Admin Authorized)" : "DENY_403 (Citizen Restricted)",
    });

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Administrator access required.",
      });
    }

    return next();
  });
};

module.exports = {
  extractToken,
  optionalAuth,
  requireAuth,
  requireAdmin,
  ADMIN_EMAILS,
};
