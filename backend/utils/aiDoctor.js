const axios = require("axios");

async function callHF(prompt) {
  try {
    const HF_TOKEN = process.env.HF_TOKEN;
    const HF_MODEL =
      process.env.HF_MODEL || "deepseek-ai/DeepSeek-R1";

    if (!HF_TOKEN) {
      throw new Error("HF_TOKEN is missing");
    }

    const response = await axios.post(
      "https://router.huggingface.co/v1/chat/completions",
      {
        model: HF_MODEL,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 1200,
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

    const message = response.data?.choices?.[0]?.message || {};

    // Different Hugging Face / DeepSeek responses may place the answer
    // in content, reasoning_content, or (less commonly) text.
    let text =
      message.content ||
      message.reasoning_content ||
      response.data?.choices?.[0]?.text ||
      "";

    if (typeof text !== "string") {
      text = JSON.stringify(text);
    }

    // Remove DeepSeek thinking blocks when they are included in content.
    text = text
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();

    // Remove markdown fences.
    text = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    console.log("HF AI RESPONSE:", text);

    return text;
  } catch (err) {
    console.log(
      "Hugging Face error:",
      err.response?.data || err.message
    );
    throw err;
  }
}


// ---------------- SYMPTOM ANALYZER ----------------

async function analyzeSymptom({ text }) {
  const prompt = `
You are MediSense AI, a medical assistant generating a patient report.

Patient condition:
${text}

Return ONLY one valid JSON object. Do not write anything before or after the JSON.

Required format:
{
  "severity": "Low | Moderate | High",
  "summary": "3-4 sentence medical explanation",
  "abnormalities": ["string"],
  "treatments": ["string"],
  "warnings": ["string"],
  "seeDoctorReason": "2 sentence doctor advice"
}

Rules:
- Return valid JSON only.
- No markdown.
- All keys must exist.
- All arrays must contain strings.
- Do not invent patient information.
- Do not claim certainty when the information is insufficient.
`;

  try {
    const raw = await callHF(prompt);

    if (!raw || !raw.trim()) {
      throw new Error("Empty response returned by AI");
    }

    // Extract the first JSON object even if the model adds surrounding text.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      throw new Error(`No JSON object returned by AI. Raw response: ${raw}`);
    }

    const jsonText = raw.substring(start, end + 1);
    const parsed = JSON.parse(jsonText);

    return {
      severity: ["Low", "Moderate", "High"].includes(parsed.severity)
        ? parsed.severity
        : "Moderate",
      summary: parsed.summary || "",
      abnormalities: Array.isArray(parsed.abnormalities)
        ? parsed.abnormalities.map(String)
        : [],
      treatments: Array.isArray(parsed.treatments)
        ? parsed.treatments.map(String)
        : [],
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings.map(String)
        : [],
      seeDoctorReason:
        parsed.seeDoctorReason || "Please consult a doctor",
    };
  } catch (err) {
    console.log(
      "SYMPTOM AI ERROR:",
      err.response?.data || err.message
    );

    return {
      severity: "Moderate",
      summary: "Could not generate summary",
      abnormalities: [],
      treatments: [],
      warnings: [],
      seeDoctorReason: "Please consult a doctor",
    };
  }
}


// ---------------- CHAT ASSISTANT ----------------

async function chatAssistant({ report, question }) {
  const prompt = `
You are MediSense AI medical assistant.

Patient report:
${report || "No report available"}

Question:
${question}

Give a simple, safe medical explanation.
Do not invent patient information.
`;

  try {
    const reply = await callHF(prompt);
    return reply || "No response";
  } catch (err) {
    console.log(
      "CHAT AI ERROR:",
      err.response?.data || err.message
    );

    return "AI unavailable";
  }
}


module.exports = {
  analyzeSymptom,
  chatAssistant,
};
