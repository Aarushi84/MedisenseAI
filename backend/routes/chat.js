const express = require("express");
const router = express.Router();
const axios = require("axios");

const Report = require("../models/Report");

router.post("/", async (req, res) => {
  try {
    const { message, name } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    // GET LATEST REPORT
    const report = await Report.findOne({ patientName: name || "" })
      .sort({ date: -1 });

    // STRONG REPORT CONTEXT
    let reportContext = "No report found for this patient.";

    if (report) {
      reportContext = `
PATIENT MEDICAL REPORT (TRUST THIS DATA - DO NOT IGNORE):

Condition: ${report.result}
Confidence: ${report.confidence}
Area: ${report.area}
Description: ${report.description}
Duration: ${report.duration}
Severity: ${report.severity}
Summary: ${report.summary}
Treatments: ${(report.treatments || []).join(", ")}
Warnings: ${(report.warnings || []).join(", ")}
Doctor Advice: ${report.seeDoctorReason}

IMPORTANT:
- If question relates to this patient, ALWAYS use this report.
- NEVER say "I don't have access" because report IS provided above.
- If question is unrelated, ignore report.
`;
    }

    const systemPrompt = `
You are MediSense AI medical assistant.

You can:
1. Answer general medical questions
2. Answer patient-specific questions using report

RULES (VERY IMPORTANT):
- If report is present, you MUST use it when relevant
- NEVER say you do not have access to report
- NEVER ask user to provide report again
- If question is about patient health → USE REPORT
- If general question → ignore report

${reportContext}
`;

    const HF_TOKEN = process.env.HF_TOKEN;
    const HF_MODEL =
      process.env.HF_MODEL || "deepseek-ai/DeepSeek-R1";

    if (!HF_TOKEN) {
      console.error("HF_TOKEN is missing");
      return res.status(500).json({ error: "AI service not configured" });
    }

    const response = await axios.post(
      "https://router.huggingface.co/v1/chat/completions",
      {
        model: HF_MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: message,
          },
        ],
        max_tokens: 1000,
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      }
    );

    let reply =
      response.data?.choices?.[0]?.message?.content || "";

    // Remove DeepSeek thinking section
    reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    // Remove Markdown code fences if returned
    reply = reply
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    return res.json({
      reply,
      reportUsed: !!report,
      reportId: report ? report._id : null,
      image: report ? report.image : null,
    });

  } catch (err) {
    console.error(
      "Chat Error:",
      err.response?.data || err.message || err
    );

    return res.status(500).json({
      error: "Chat failed",
    });
  }
});

module.exports = router;
