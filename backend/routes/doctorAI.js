const express = require("express");
const router = express.Router();
const User = require("../models/User");

async function requireDoctor(req, res, next) {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "Not logged in" });
  const user = await User.findById(userId);
  if (!user || user.role !== "doctor") {
    return res.status(403).json({ error: "Doctor access only" });
  }
  next();
}


router.post("/ai-lookup", requireDoctor, async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "Messages required",
      });
    }

    const HF_TOKEN = process.env.HF_TOKEN;
    const HF_MODEL =
      process.env.HF_MODEL || "deepseek-ai/DeepSeek-R1";

    if (!HF_TOKEN) {
      console.error("HF_TOKEN is missing");
      return res.status(500).json({
        error: "AI service not configured",
      });
    }

    const systemMessage = {
      role: "system",
      content: `
You are MediSense AI Clinical and Drug Lookup Assistant.

You assist physicians with general clinical and drug-related information.

Rules:
- Provide factual, concise, physician-oriented information.
- For medication questions, explain uses, common side effects, important precautions, contraindications, and relevant interactions when appropriate.
- Do not invent drug information.
- If information is uncertain, clearly say so.
- Do not diagnose a patient from insufficient information.
- Do not prescribe or recommend a specific treatment for an individual patient.
- Remind the physician that clinical judgment and authoritative medical references should be used for patient-specific decisions.
`,
    };

    const hfResponse = await fetch(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: HF_MODEL,
          messages: [systemMessage, ...messages],
          max_tokens: 1200,
          temperature: 0.2,
        }),
      }
    );

    const data = await hfResponse.json();

    if (!hfResponse.ok) {
      console.error("HUGGING FACE LOOKUP ERROR:", data);

      throw new Error(
        data?.error?.message ||
        data?.error ||
        "Hugging Face request failed"
      );
    }

    let reply =
      data?.choices?.[0]?.message?.content || "";

    // Remove DeepSeek thinking
    reply = reply
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();

    // Remove Markdown code fences if returned
    reply = reply
      .replace(/^```(?:json|text)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    if (!reply) {
      throw new Error("AI returned an empty response");
    }

    res.json({
      reply,
    });

  } catch (err) {
    console.error(
      "AI LOOKUP ERROR:",
      err.message || err
    );

    res.status(500).json({
      error: "Failed to get AI response",
    });
  }
});
module.exports = router;
