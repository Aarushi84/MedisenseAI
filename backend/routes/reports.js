const express = require("express");
const router = express.Router();
const axios = require("axios");
const fs = require("fs");
const pdfParse = require("pdf-parse");

const Report = require("../models/Report");
const aiDoctor = require("../utils/aiDoctor");

const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});

const upload = multer({ storage });

/* ---------------- GET REPORTS ---------------- */
router.get("/", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) return res.status(400).json({ error: "Missing user id" });

    const reports = await Report.find({ patientId: userId }).sort({ createdAt: -1 });

    const normalized = reports.map(r => ({
      _id: r._id,
      patientName: r.patientName || "",
      image: r.image || "",
      age: r.age || "",
      height: r.height || "",
      weight: r.weight || "",
      bloodPressure: r.bloodPressure || "",
      bloodSugar: r.bloodSugar || "",
      area: r.area || "",
      description: r.description || "",
      duration: r.duration || "",
      disease: r.disease || "",
      severity: r.severity || "Moderate",
      summary: r.summary || "",
      confidence: r.confidence || 0,
      warnings: Array.isArray(r.warnings) ? r.warnings : [],
      abnormalities: Array.isArray(r.abnormalities) ? r.abnormalities : [],
      treatments: Array.isArray(r.treatments) ? r.treatments : [],
      seeDoctorReason: r.seeDoctorReason || "",
      originalname: r.originalname || "",
      createdAt: r.createdAt
    }));
    res.json(normalized);

  } catch (err) {
    console.log("GET REPORTS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

/* ---------------- IMAGE AI ---------------- */
router.post("/predict-image", upload.single("image"), async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId || !req.file) {
      return res.status(400).json({ error: "Missing data" });
    }

    const imgBuffer = fs.readFileSync(req.file.path);

    let disease = "Unknown";
    let confidence = 0;

  try {
  const { Client, handle_file } = await import("@gradio/client");

  const HF_TOKEN = process.env.HF_TOKEN;

  if (!HF_TOKEN) {
    throw new Error("HF_TOKEN is missing");
  }

  const client = await Client.connect(
    "Aarushi12/MediSense-AI",
    {
      token: HF_TOKEN,
    }
  );

  const result = await client.predict(
    "/gradio_predict",
    {
      image: handle_file(req.file.path),
    }
  );

  console.log("GRADIO RESULT:", result);

  const output = result?.data;

  /*
    Handle common Gradio response shapes.
  */
  if (Array.isArray(output)) {
    if (typeof output[0] === "object" && output[0] !== null) {
      disease =
        output[0].disease ||
        output[0].label ||
        output[0].prediction ||
        output[0].class ||
        "Unknown";

      confidence =
        Number(
          output[0].confidence ??
          output[0].score ??
          0
        );

    } else {
      disease = output[0] || "Unknown";
      confidence = Number(output[1] || 0);
    }
  } else if (output && typeof output === "object") {
    disease =
      output.disease ||
      output.label ||
      output.prediction ||
      output.class ||
      "Unknown";

    confidence =
      Number(
        output.confidence ??
        output.score ??
        0
      );
  } else if (typeof output === "string") {
    disease = output;
  }

  // Convert decimal confidence to percentage if necessary
  if (confidence > 0 && confidence <= 1) {
    confidence = confidence * 100;
  }

  console.log(
    "FINAL PREDICTION:",
    disease,
    confidence
  );

} catch (err) {
  console.log(
    "GRADIO IMAGE FAIL:",
    err.message || err
  );

  disease = "Unknown";
  confidence = 0;
}

    const ai = await aiDoctor.analyzeSymptom({
      text: `Patient diagnosed with ${disease} (${confidence}%)`
    });

    const report = await Report.create({
      patientId: userId,
      recordType: "patient-ai",
      patientName: req.body.patientName,
      age: req.body.age,
      height: req.body.height,
      weight: req.body.weight,
      bloodPressure: req.body.bloodPressure,
      bloodSugar: req.body.bloodSugar,
      area: req.body.area,
      description: req.body.description,
      duration: req.body.duration,
      image: req.file.filename,
      originalname: req.file.originalname,
      disease,
      confidence,
      severity: ai?.severity || "Moderate",
      summary: ai?.summary || "",
      warnings: Array.isArray(ai?.warnings) ? ai.warnings : [],
      abnormalities: Array.isArray(ai?.abnormalities) ? ai.abnormalities : [],
      treatments: Array.isArray(ai?.treatments) ? ai.treatments : [],
      seeDoctorReason: ai?.seeDoctorReason || ""
    });

    res.json({
      reportId: report._id,
      filename: req.file.originalname,
      patientName: report.patientName,
      disease: report.disease,
      confidence: report.confidence,
      age: report.age,
      height: report.height,
      weight: report.weight,
      bloodPressure: report.bloodPressure,
      bloodSugar: report.bloodSugar,
      area: report.area,
      description: report.description,
      duration: report.duration,
      severity: report.severity,
      riskLevel: report.severity,
      summary: report.summary,
      warnings: report.warnings || [],
      abnormalities: report.abnormalities || [],
      treatments: report.treatments || [],
      seeDoctorReason: report.seeDoctorReason || ""
    });

  } catch (err) {
    console.log("IMAGE ERROR:", err.message);
    res.status(500).json({ error: "Image prediction failed" });
  }
});

/* ---------------- PDF AI ---------------- */
router.post("/upload-pdf", upload.single("file"), async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId || !req.file) {
      return res.status(400).json({ error: "Missing data" });
    }

    const fileBuffer = fs.readFileSync(req.file.path);

    let text = "";
    try {
      const pdfData = await pdfParse(fileBuffer);
      text = pdfData.text || "";
    } catch (e) {
      console.log("PDF PARSE FAIL:", e.message);
    }

    let summary = "";
    let severity = "Moderate";

    try {
      const flaskRes = await axios.post(`${process.env.AI_SERVICE_URL}/pdf-summary`, { text });
      summary = flaskRes.data?.summary || "";
      const risk = flaskRes.data?.riskLevel;
      severity = ["Low", "Moderate", "High"].includes(risk) ? risk : "Moderate";
    } catch (err) {
      console.log("FLASK PDF FAIL:", err.response?.data || err.message);
    }

    const ai = await aiDoctor.analyzeSymptom({ text });

    res.json({
      filename: req.file.originalname,
      summary: summary || ai?.summary || "",
      severity: severity || ai?.severity || "Moderate",
      warnings: ai?.warnings || [],
      abnormalities: ai?.abnormalities || [],
      treatments: ai?.treatments || [],
      seeDoctorReason: ai?.seeDoctorReason || ""
    });

  } catch (err) {
    console.log("PDF ERROR:", err.message);
    res.status(500).json({ error: "PDF processing failed" });
  }
});

/* ---------------- SYMPTOM (UNCHANGED) ---------------- */
router.post("/predict", async (req, res) => {
  try {
    const ai = await aiDoctor.analyzeSymptom({ text: JSON.stringify(req.body) });
    res.json(ai);
  } catch (err) {
    res.status(500).json({
      severity: "Moderate",
      summary: "System error",
      warnings: [],
      abnormalities: []
    });
  }
});

/* ---------------- CHAT (UNCHANGED) ---------------- */
router.post("/chat", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    const { message } = req.body;

    const report = await Report.findOne({ patientId: userId }).sort({ createdAt: -1 });

    const reply = await aiDoctor.chatAssistant({
      report: report?.reportText || "",
      question: message
    });

    res.json({ reply, reportId: report?._id || null });

  } catch (err) {
    res.status(500).json({ error: "Chat failed" });
  }
});

/* ---------------- MANUAL PATIENT RECORD (DOCTOR ENTRY) ---------------- */
router.post("/", async (req, res) => {
  try {
    const {
      patientName, age, gender, area, description, duration, image,
      height, weight, bloodPressure, bloodSugar, symptoms, notes,
    } = req.body;

    if (!patientName || !age) {
      return res.status(400).json({ error: "Patient name and age are required" });
    }

    const report = await Report.create({
      recordType: "doctor",
      patientName,
      age,
      gender,
      area,
      description,
      duration,
      image,
      height,
      weight,
      bloodPressure,
      bloodSugar,
      symptoms: Array.isArray(symptoms) ? symptoms : [],
      notes,
    });

    res.json(report);
  } catch (err) {
    console.log("MANUAL REPORT SAVE ERROR:", err.message);
    res.status(500).json({ error: "Failed to save patient record" });
  }
});

module.exports = router;
