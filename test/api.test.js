const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { app } = require("../server");
const { connectDB } = require("../config/db");
const Complaint = require("../models/Complaint");
const Notification = require("../models/Notification");

let server;
let baseUrl;

const startTestServer = async () => {
  await connectDB();
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`Test server running at ${baseUrl}`);
      resolve();
    });
  });
};

const stopTestServer = async () => {
  await mongoose.disconnect();
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
};

async function runTests() {
  console.log("\n=======================================================");
  console.log("   CivicConnect Backend End-to-End API Test Suite   ");
  console.log("=======================================================\n");

  await startTestServer();

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   Error: ${err.message}`);
      failed++;
    }
  }

  // 1. Root & Health Check Endpoint Tests
  await test("GET / returns 200 with server info", async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(data.message.includes("CivicConnect"));
  });

  await test("GET /health returns healthcheck JSON", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert([200, 503].includes(res.status));
    const data = await res.json();
    assert(data.status);
    assert(data.services.api.status === "healthy");
  });

  await test("GET /api/health returns healthcheck JSON", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert([200, 503].includes(res.status));
    const data = await res.json();
    assert(data.status);
  });

  // 2. Validation & Error Handling Tests
  await test("POST /api/complaints fails with 400 when title or description is missing", async () => {
    const res = await fetch(`${baseUrl}/api/complaints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "Garbage" }),
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert(data.message.includes("title is required") || data.message.includes("Title"));
  });

  await test("GET /api/complaints/invalid-id-format returns 404 or 400", async () => {
    const res = await fetch(`${baseUrl}/api/complaints/nonexistent-id-9999`);
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });

  // 3. Security & Authorization Tests
  await test("PUT /api/complaints/:id rejects unauthenticated request with 401", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await fetch(`${baseUrl}/api/complaints/${fakeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Under Process" }),
    });
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });

  await test("PUT /api/complaints/:id rejects ordinary citizen with 403 Forbidden", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await fetch(`${baseUrl}/api/complaints/${fakeId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": "user_citizen_123",
        "x-test-user-email": "citizen@example.com",
        "x-test-user-role": "citizen",
      },
      body: JSON.stringify({ status: "Under Process" }),
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert(data.message.includes("Forbidden") || data.message.includes("Administrator"));
  });

  await test("GET /api/complaints/my requires authentication", async () => {
    const res = await fetch(`${baseUrl}/api/complaints/my`);
    assert.strictEqual(res.status, 401);
  });

  // 4. Complaint Management Endpoints (Mocked / In-Memory / Connected DB)
  let createdComplaintId;
  let createdMongoId;

  await test("POST /api/complaints creates a new complaint with image upload via Multer", async () => {
    const formData = new FormData();
    formData.append("title", "Overflowing Garbage Dumpster on Main Road");
    formData.append("description", "Garbage hasn't been collected for 4 days, causing foul smell and blocking pavement.");
    formData.append("category", "Garbage");
    formData.append("location", "Main Road, Sector 12");
    formData.append("coordinates", JSON.stringify({ latitude: 28.62, longitude: 77.21, city: "New Delhi" }));
    formData.append("userId", "user_test_citizen_456");
    formData.append("userName", "Rahul Sharma");
    formData.append("userEmail", "rahul@example.com");

    // Attach sample image
    const sampleImageBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const blob = new Blob([sampleImageBytes], { type: "image/png" });
    formData.append("image", blob, "test-evidence.png");

    const res = await fetch(`${baseUrl}/api/complaints`, {
      method: "POST",
      body: formData,
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(data.data.image.length > 0);
    assert(data.data.imageUrl.includes("/uploads/"));

    // Verify uploaded image can be retrieved via HTTP GET
    const imgRes = await fetch(data.data.imageUrl);
    assert.strictEqual(imgRes.status, 200);
    assert.strictEqual(imgRes.headers.get("content-type"), "image/png");
  });

  await test("POST /api/complaints creates a new complaint with valid JSON data", async () => {
    const complaintData = {
      title: "Broken Streetlight on 5th Avenue",
      description: "Streetlight has been flickering and completely off since yesterday evening.",
      category: "Street Light",
      location: "5th Avenue, Sector 4",
      coordinates: JSON.stringify({ latitude: 28.6139, longitude: 77.209, city: "New Delhi" }),
      userId: "user_test_citizen_456",
      userName: "Rahul Sharma",
      userEmail: "rahul@example.com",
    };

    // Use FormData for multipart simulation or urlencoded/json
    const res = await fetch(`${baseUrl}/api/complaints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(complaintData),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.title, complaintData.title);
    assert.strictEqual(data.data.status, "Pending");
    assert(data.data.complaintId.startsWith("CC-"));

    createdComplaintId = data.data.complaintId;
    createdMongoId = data.data._id || data.data.id;
  });

  await test("GET /api/complaints returns list of complaints", async () => {
    const res = await fetch(`${baseUrl}/api/complaints`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(Array.isArray(data.data));
    assert(data.data.length >= 1);
  });

  await test("GET /api/complaints/:id returns the individual complaint", async () => {
    const res = await fetch(`${baseUrl}/api/complaints/${createdComplaintId}`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.title, "Broken Streetlight on 5th Avenue");
  });

  await test("GET /api/complaints/my returns complaints for authenticated citizen", async () => {
    const res = await fetch(`${baseUrl}/api/complaints/my`, {
      headers: {
        "x-test-user-id": "user_test_citizen_456",
        "x-test-user-email": "rahul@example.com",
      },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(Array.isArray(data.data));
    assert(data.data.some((c) => c.title === "Broken Streetlight on 5th Avenue"));
  });

  // 5. Admin Actions & Status Updates
  await test("PUT /api/complaints/:id allows authorized admin to update status, priority, and remarks", async () => {
    const updateBody = {
      status: "Under Process",
      priority: "High",
      department: "Electrical & Street Lighting",
      adminRemarks: "Assigned technician unit #4. Work scheduled for tomorrow 10 AM.",
    };

    const res = await fetch(`${baseUrl}/api/complaints/${createdMongoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": "admin_gov_999",
        "x-test-user-email": "admin@civicconnect.gov",
        "x-test-user-role": "admin",
      },
      body: JSON.stringify(updateBody),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, "Under Process");
    assert.strictEqual(data.data.priority, "High");
    assert.strictEqual(data.data.department, "Electrical & Street Lighting");
    assert.strictEqual(data.data.adminRemarks, updateBody.adminRemarks);
  });

  await test("PUT /api/complaints/:id rejects invalid status value with 400", async () => {
    const res = await fetch(`${baseUrl}/api/complaints/${createdMongoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": "admin_gov_999",
        "x-test-user-email": "admin@civicconnect.gov",
      },
      body: JSON.stringify({ status: "InvalidStatusXYZ" }),
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert(data.message.includes("Invalid status"));
  });

  // 6. Notification Endpoints
  await test("GET /api/notifications returns notification for the status change", async () => {
    const res = await fetch(`${baseUrl}/api/notifications`, {
      headers: {
        "x-test-user-id": "user_test_citizen_456",
        "x-test-user-email": "rahul@example.com",
      },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(Array.isArray(data.data));
    assert(data.data.length >= 1);
  });

  await test("POST /api/notifications allows admin to broadcast announcement", async () => {
    const res = await fetch(`${baseUrl}/api/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": "admin_gov_999",
        "x-test-user-email": "admin@civicconnect.gov",
      },
      body: JSON.stringify({
        message: "Notice: City-wide water pipeline maintenance on Sunday from 2 AM to 6 AM.",
      }),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.recipientUserId, "all");
  });

  // 7. Dynamic Stats Endpoint
  await test("GET /api/complaints/stats returns dynamic statistics calculated from MongoDB", async () => {
    const res = await fetch(`${baseUrl}/api/complaints/stats`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(typeof data.data.total === "number");
    assert(typeof data.data.pending === "number");
    assert(typeof data.data.underProcess === "number");
    assert(typeof data.data.solved === "number");
    assert(typeof data.data.byCategory === "object");
    assert(typeof data.data.byDepartment === "object");
    assert(typeof data.data.byPriority === "object");
  });

  // 8. Delete Complaint
  await test("DELETE /api/complaints/:id allows authorized user/admin to delete", async () => {
    const res = await fetch(`${baseUrl}/api/complaints/${createdMongoId}`, {
      method: "DELETE",
      headers: {
        "x-test-user-id": "admin_gov_999",
        "x-test-user-email": "admin@civicconnect.gov",
      },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    // Verify it is gone
    const verifyRes = await fetch(`${baseUrl}/api/complaints/${createdMongoId}`);
    assert.strictEqual(verifyRes.status, 404);
  });

  await stopTestServer();

  console.log("\n=======================================================");
  console.log(`   Tests Completed: ${passed} Passed, ${failed} Failed`);
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(async (err) => {
  console.error("Unhandled test suite error:", err);
  await stopTestServer();
  process.exit(1);
});
