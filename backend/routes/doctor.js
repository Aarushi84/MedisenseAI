const express = require("express");
const router = express.Router();
const Report = require("../models/Report");
const User = require("../models/User");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const Document = require("../models/Document");

async function requireDoctor(req, res, next) {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "Not logged in" });
  const user = await User.findById(userId);
  if (!user || user.role !== "doctor") {
    return res.status(403).json({ error: "Doctor access only" });
  }
  next();
}

router.get("/stats", requireDoctor, async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const bmiPipeline = (matchStage) => [
      { $match: matchStage },
      { $project: { createdAt: 1,
          h: { $convert: { input: "$height", to: "double", onError: null, onNull: null } },
          w: { $convert: { input: "$weight", to: "double", onError: null, onNull: null } } } },
      { $match: { h: { $gt: 0 }, w: { $gt: 0 } } },
      { $project: { createdAt: 1, bmi: { $divide: ["$w", { $pow: [{ $divide: ["$h", 100] }, 2] }] } } },
    ];

    const [totalPatients, reportsToday, riskAlerts, conditionAgg, weeklyAgg, bmiTrendAgg, avgBmiAgg] = await Promise.all([
      User.countDocuments({ role: "patient" }),
      Report.countDocuments({ createdAt: { $gte: startOfToday } }),
      Report.countDocuments({ severity: "High", createdAt: { $gte: startOfWeek } }),
      Report.aggregate([{ $match: { disease: { $ne: "" } } }, { $group: { _id: "$disease", count: { $sum: 1 } } }]),
      Report.aggregate([{ $match: { createdAt: { $gte: startOfWeek } } }, { $group: { _id: { $dayOfWeek: "$createdAt" }, count: { $sum: 1 } } }]),
      Report.aggregate([...bmiPipeline({ createdAt: { $gte: sixMonthsAgo } }), { $group: { _id: { $month: "$createdAt" }, avgBmi: { $avg: "$bmi" } } }, { $sort: { _id: 1 } }]),
      Report.aggregate([...bmiPipeline({}), { $group: { _id: null, avgBmi: { $avg: "$bmi" } } }]),
    ]);

    const totalConditions = conditionAgg.reduce((sum, c) => sum + c.count, 0);
    const conditionDistribution = conditionAgg.map((c) => ({ name: c._id, value: totalConditions ? Math.round((c.count / totalConditions) * 100) : 0 }));
    const dayMap = { 1: "Sun", 2: "Mon", 3: "Tue", 4: "Wed", 5: "Thu", 6: "Fri", 7: "Sat" };
    const weeklyPatients = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => {
      const match = weeklyAgg.find((w) => dayMap[w._id] === day);
      return { day, patients: match ? match.count : 0 };
    });
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const bmiTrend = bmiTrendAgg.map((m) => ({ month: monthNames[m._id - 1], bmi: Math.round(m.avgBmi * 10) / 10 }));

    res.json({
      totalPatients,
      avgBmi: avgBmiAgg[0] ? Math.round(avgBmiAgg[0].avgBmi * 10) / 10 : 0,
      reportsToday, riskAlerts, conditionDistribution, weeklyPatients, bmiTrend,
    });
  } catch (err) {
    console.log("DOCTOR STATS ERROR:", err.message);
    res.status(500).json({ error: "Failed to load stats" });
  }
});

router.get("/patients", requireDoctor, async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 }).limit(10)
      .select("recordType patientName age gender height weight bloodPressure bloodSugar area description duration symptoms otherSymptoms notes disease severity summary treatments warnings abnormalities seeDoctorReason image createdAt");
    const recentPatients = reports.map((r) => {
      const h = parseFloat(r.height), w = parseFloat(r.weight);
      const bmi = h > 0 && w > 0 ? Math.round((w / Math.pow(h / 100, 2)) * 10) / 10 : "-";
      return { id: r._id, name: r.patientName || "Unknown", age: r.age || "-", gender: r.gender || "-", recordType: r.recordType, bmi,
        height: r.height || "-", weight: r.weight || "-", bloodPressure: r.bloodPressure || "-", bloodSugar: r.bloodSugar || "-",
        area: r.area || "-", description: r.description || "-", duration: r.duration || "-", symptoms: r.symptoms || [],
        otherSymptoms: r.otherSymptoms || "", notes: r.notes || "", risk: r.severity || "Moderate", condition: r.disease || "-",
        summary: r.summary || "", warnings: r.warnings || [], abnormalities: r.abnormalities || [], treatments: r.treatments || [],
        seeDoctorReason: r.seeDoctorReason || [], createdAt: r.createdAt };
    });
    res.json({ recentPatients });
  } catch (err) {
    console.log("DOCTOR PATIENTS ERROR:", err.message);
    res.status(500).json({ error: "Failed to load patients" });
  }
});

router.get("/patients/all", requireDoctor, async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 })
      .select("recordType patientName age gender height weight bloodPressure bloodSugar area description duration symptoms otherSymptoms notes disease severity summary treatments warnings abnormalities seeDoctorReason image createdAt");
    const allPatients = reports.map((r) => {
      const h = parseFloat(r.height), w = parseFloat(r.weight);
      const bmi = h > 0 && w > 0 ? Math.round((w / Math.pow(h / 100, 2)) * 10) / 10 : "-";
      return { id: r._id, name: r.patientName || "Unknown", age: r.age || "-", gender: r.gender || "-", recordType: r.recordType, bmi,
        height: r.height || "-", weight: r.weight || "-", bloodPressure: r.bloodPressure || "-", bloodSugar: r.bloodSugar || "-",
        risk: r.severity || "Moderate", condition: r.disease || "-", area: r.area || "-", description: r.description || "-",
        duration: r.duration || "-", symptoms: r.symptoms || [], otherSymptoms: r.otherSymptoms, notes: r.notes || "",
        date: r.createdAt, summary: r.summary || "", treatments: r.treatments || [], warnings: r.warnings || [],
        abnormalities: r.abnormalities || [], seeDoctorReason: r.seeDoctorReason || "", image: r.image || "" };
    });
    res.json({ allPatients });
  } catch (err) {
    console.log("DOCTOR ALL PATIENTS ERROR:", err.message);
    res.status(500).json({ error: "Failed to load all patients" });
  }
});

const uploadDir = path.join(__dirname, "..", "uploads", "documents");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const docStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
  },
});
const docUpload = multer({ storage: docStorage });

router.get("/patients-list", requireDoctor, async (req, res) => {
  try {
    const patients = await User.find({ role: "patient" }).select("name email");
    res.json({ patients: patients.map((p) => ({ id: p._id, name: p.name, email: p.email })) });
  } catch (err) {
    console.log("PATIENTS LIST ERROR:", err.message);
    res.status(500).json({ error: "Failed to load patients" });
  }
});

router.post("/upload-document", requireDoctor, docUpload.array("files", 10), async (req, res) => {
  try {
    const { patientId, patientName, docType, notes } = req.body;
    if (!patientId || !docType || !req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Missing patient, document type, or files" });
    }
    const doctorId = req.headers["x-user-id"];
    const saved = await Promise.all(
      req.files.map((f) =>
        Document.create({
          patient: patientId,
          doctor: doctorId,
          documentType: docType,
          fileName: f.originalname,
          filePath: f.filename,
          fileSize: f.size,
          doctorNotes: notes || "",
        })
      )
    );
    res.json({ documents: saved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/recent-uploads", requireDoctor, async (req, res) => {
  try {
    const doctorId = req.headers["x-user-id"];
    const docs = await Document.find({ doctor: doctorId })
      .populate("patient", "name")
      .sort({ createdAt: -1 })
      .limit(5);
    res.json({
      uploads: docs.map((d) => ({
        id: d._id,
        name: d.fileName,
        patient: d.patient?.name || "Unknown",
        type: d.documentType,
        size: d.fileSize,
        date: d.createdAt,
      })),
    });
  } catch (err) {
    console.log("RECENT UPLOADS ERROR:", err.message);
    res.status(500).json({ error: "Failed to load recent uploads" });
  }
});

router.get("/storage", requireDoctor, async (req, res) => {
  try {
    const doctorId = req.headers["x-user-id"];
    const agg = await Document.aggregate([
      { $match: { doctor: new mongoose.Types.ObjectId(doctorId) } },
      { $group: { _id: null, total: { $sum: "$fileSize" } } },
    ]);
    res.json({ totalBytes: agg[0]?.total || 0 });
  } catch (err) {
    console.log("STORAGE ERROR:", err.message);
    res.status(500).json({ error: "Failed to load storage" });
  }
});

router.get("/patient/:patientId/documents", requireDoctor, async (req, res) => {
  try {
    const doctorId = req.headers["x-user-id"];
    const docs = await Document.find({ patient: req.params.patientId, doctor: doctorId })
      .sort({ createdAt: -1 });
    res.json({
      documents: docs.map((d) => ({
        id: d._id,
        name: d.fileName,
        type: d.documentType,
        size: d.fileSize,
        notes: d.doctorNotes,
        date: d.createdAt,
      })),
    });
  } catch (err) {
    console.log("PATIENT DOCUMENTS ERROR:", err.message);
    res.status(500).json({ error: "Failed to load documents" });
  }
});

router.get("/document/:id/download", requireDoctor, async (req, res) => {
  try {
    const doctorId = req.headers["x-user-id"];
    const doc = await Document.findOne({ _id: req.params.id, doctor: doctorId });
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const filePath = path.join(uploadDir, doc.filePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing on disk" });

    res.download(filePath, doc.fileName);
  } catch (err) {
    console.log("DOWNLOAD ERROR:", err.message);
    res.status(500).json({ error: "Failed to download document" });
  }
});

  router.put("/report/:reportId/other-symptoms", requireDoctor, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { otherSymptoms } = req.body;
    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ error: "Report not found" });
    report.otherSymptoms = otherSymptoms;
    await report.save();
    res.json({ success: true, message: "Other symptoms updated successfully", report });
  } catch (err) {
    console.error("UPDATE OTHER SYMPTOMS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});
router.get("/patient-reports", requireDoctor, async (req, res) => {
  try {
    const { name } = req.query;

    if (!name) {
      return res.status(400).json({ error: "Patient name required" });
    }

    // Find the patient from the User collection first
    const patient = await User.findOne({
      name: name,
      role: "patient",
    }).select("_id name");

    if (!patient) {
      return res.json({ reports: [] });
    }

    // Find reports using patientId OR patientName
    // This keeps compatibility with existing reports.
    const reports = await Report.find({
      $or: [
        { patientId: patient._id.toString() },
        { patientName: patient.name },
      ],
      disease: { $ne: "" },
    })
      .sort({ createdAt: -1 })
      .select(
        "disease severity summary symptoms bloodPressure bloodSugar height weight duration createdAt"
      );

    res.json({ reports });
  } catch (err) {
    console.log("PATIENT REPORTS ERROR:", err.message);
    res.status(500).json({ error: "Failed to load patient reports" });
  }
});
router.post("/generate-summary", requireDoctor, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "No text provided" });

  const flaskRes = await fetch(`${process.env.AI_SERVICE_URL}/pdf-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await flaskRes.json();
    if (data.error) throw new Error(data.error);

    res.json(data);
  } catch (err) {
    console.log("GENERATE SUMMARY ERROR:", err.message);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});
module.exports = router;
