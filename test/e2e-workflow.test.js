const assert = require("assert");
const http = require("http");
const mongoose = require("mongoose");
const { app } = require("../server");
const { connectDB } = require("../config/db");
const Complaint = require("../models/Complaint");
const Notification = require("../models/Notification");

let server;
let baseUrl;

async function start() {
  await connectDB();
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
}

async function stop() {
  await mongoose.disconnect();
  return new Promise((resolve) => {
    if (server) server.close(() => resolve());
    else resolve();
  });
}

async function runE2E() {
  console.log("\n=======================================================");
  console.log("   CivicConnect Full End-to-End Workflow Verification   ");
  console.log("=======================================================\n");

  await start();

  let passed = 0;
  let failed = 0;

  async function step(name, fn) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ ${name} - Failed: ${err.message}`);
      failed++;
    }
  }

  let testComplaintId;
  let testMongoId;

  // WORKFLOW 1: CITIZEN
  console.log("--- Workflow 1: Citizen Journey ---");

  await step("Citizen submits complaint with evidence image and geo coordinates", async () => {
    const formData = new FormData();
    formData.append("title", "Dangerous Open Manhole on MG Road");
    formData.append("description", "Uncovered manhole near metro station gate 2 poses extreme hazard at night.");
    formData.append("category", "Drainage");
    formData.append("location", "MG Road Metro Pillar 42, Bengaluru");
    formData.append("coordinates", JSON.stringify({ latitude: 12.9716, longitude: 77.5946, city: "Bengaluru" }));
    formData.append("language", "en");
    formData.append("voiceTranscript", "There is a deep uncovered manhole near metro gate 2.");
    formData.append("userId", "user_citizen_ananya");
    formData.append("userName", "Ananya Rao");
    formData.append("userEmail", "ananya@example.com");

    const samplePng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    formData.append("image", new Blob([samplePng], { type: "image/png" }), "manhole.png");

    const res = await fetch(`${baseUrl}/api/complaints`, {
      method: "POST",
      body: formData,
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.title, "Dangerous Open Manhole on MG Road");
    assert.strictEqual(data.data.status, "Pending");
    assert(data.data.image.includes(".png"));
    assert(data.data.imageUrl.includes("/uploads/"));

    testComplaintId = data.data.complaintId;
    testMongoId = data.data._id || data.data.id;
  });

  await step("Complaint record is verified in MongoDB directly", async () => {
    const doc = await Complaint.findById(testMongoId);
    assert(doc !== null);
    assert.strictEqual(doc.complaintId, testComplaintId);
    assert.strictEqual(doc.status, "Pending");
    assert.strictEqual(doc.coordinates.city, "Bengaluru");
  });

  await step("Citizen views submitted complaint in public registry", async () => {
    const res = await fetch(`${baseUrl}/api/complaints`);
    const data = await res.json();
    const found = data.data.find((c) => c.complaintId === testComplaintId);
    assert(found !== undefined);
    assert.strictEqual(found.location, "MG Road Metro Pillar 42, Bengaluru");
  });

  await step("Citizen tracks own complaint in user portal (GET /api/complaints/my)", async () => {
    const res = await fetch(`${baseUrl}/api/complaints/my`, {
      headers: {
        "x-test-user-id": "user_citizen_ananya",
        "x-test-user-email": "ananya@example.com",
      },
    });
    const data = await res.json();
    assert(data.data.some((c) => c.complaintId === testComplaintId));
  });

  // WORKFLOW 2: ADMINISTRATOR
  console.log("\n--- Workflow 2: Administrator Management ---");

  await step("Admin views real dynamic dashboard statistics from MongoDB", async () => {
    const res = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: {
        "x-test-user-id": "admin_commissioner",
        "x-test-user-email": "commissioner@civicconnect.gov",
        "x-test-user-role": "admin",
      },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(data.data.total >= 1);
    assert(typeof data.data.byCategory === "object");
    assert(typeof data.data.byDepartment === "object");
  });

  await step("Admin opens complaint and assigns priority, department, remarks, and changes status", async () => {
    const res = await fetch(`${baseUrl}/api/complaints/${testMongoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": "admin_commissioner",
        "x-test-user-email": "commissioner@civicconnect.gov",
        "x-test-user-role": "admin",
      },
      body: JSON.stringify({
        status: "Under Process",
        priority: "High",
        department: "Water Supply & Drainage",
        adminRemarks: "Emergency barricading placed. Repair team en route.",
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.data.status, "Under Process");
    assert.strictEqual(data.data.priority, "High");
    assert.strictEqual(data.data.department, "Water Supply & Drainage");
    assert.strictEqual(data.data.adminRemarks, "Emergency barricading placed. Repair team en route.");
  });

  await step("Citizen receives real-time notification in MongoDB for the status update", async () => {
    const res = await fetch(`${baseUrl}/api/notifications`, {
      headers: {
        "x-test-user-id": "user_citizen_ananya",
        "x-test-user-email": "ananya@example.com",
      },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert(data.data.length >= 1);
    const notif = data.data.find((n) => n.message.includes("Dangerous Open Manhole"));
    assert(notif !== undefined);
    assert(notif.message.includes("Under Process"));

    // Citizen marks notification as read
    const readRes = await fetch(`${baseUrl}/api/notifications/${notif._id}/read`, {
      method: "PATCH",
    });
    assert.strictEqual(readRes.status, 200);
    const readData = await readRes.json();
    assert.strictEqual(readData.data.read, true);
  });

  await step("Admin closes complaint as Solved with completion notes", async () => {
    const res = await fetch(`${baseUrl}/api/complaints/${testMongoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": "admin_commissioner",
        "x-test-user-email": "commissioner@civicconnect.gov",
        "x-test-user-role": "admin",
      },
      body: JSON.stringify({
        status: "Solved",
        adminRemarks: "New cast iron manhole cover installed securely. Issue resolved.",
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.data.status, "Solved");
  });

  // WORKFLOW 3: SECURITY AUDIT
  console.log("\n--- Workflow 3: Security & Authorization Audit ---");

  await step("Security: Anonymous user cannot perform admin updates (401)", async () => {
    const res = await fetch(`${baseUrl}/api/complaints/${testMongoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Pending" }),
    });
    assert.strictEqual(res.status, 401);
  });

  await step("Security: Ordinary citizen cannot access admin APIs or stats (403)", async () => {
    const res = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: {
        "x-test-user-id": "user_citizen_ananya",
        "x-test-user-email": "ananya@example.com",
      },
    });
    assert.strictEqual(res.status, 403);
  });

  await step("Security: Ordinary citizen cannot alter complaints via PUT (403)", async () => {
    const res = await fetch(`${baseUrl}/api/complaints/${testMongoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": "user_citizen_ananya",
        "x-test-user-email": "ananya@example.com",
      },
      body: JSON.stringify({ status: "Pending" }),
    });
    assert.strictEqual(res.status, 403);
  });

  await step("Security: Malformed input (empty title/description) is rejected (400)", async () => {
    const res = await fetch(`${baseUrl}/api/complaints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "Road Damage" }),
    });
    assert.strictEqual(res.status, 400);
  });

  await stop();

  console.log("\n=======================================================");
  console.log(`   E2E Results: ${passed} Passed, ${failed} Failed`);
  console.log("=======================================================\n");

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runE2E().catch(async (e) => {
  console.error("E2E Execution Error:", e);
  await stop();
  process.exit(1);
});
