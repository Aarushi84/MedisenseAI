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

    let text =
      response.data?.choices?.[0]?.message?.content || "";

    // Remove DeepSeek thinking
    text = text
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();

    // Remove markdown fences
    text = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

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

Return ONLY valid JSON.

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

    // Extract JSON even if DeepSeek adds extra text
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");

    if (start === -1 || end === -1) {
      throw new Error("No JSON object returned by AI");
    }

    const parsed = JSON.parse(
      raw.substring(start, end + 1)
    );

    return {
      severity: parsed.severity || "Moderate",
      summary: parsed.summary || "",
      abnormalities: Array.isArray(parsed.abnormalities)
        ? parsed.abnormalities
        : [],
      treatments: Array.isArray(parsed.treatments)
        ? parsed.treatments
        : [],
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings
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
