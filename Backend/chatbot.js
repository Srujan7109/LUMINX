const express = require("express");


const router = express.Router();

function cleanAIResponse(text) {
  if (!text) return "";

  // Remove Markdown symbols: headers, bold, italics, strikethrough
  text = text.replace(/(\*\*|__|\*|_|\~\~|#+)/g, "");

  // Remove numbered or bulleted lists
  text = text.replace(/^\s*\d+\.\s+/gm, "");  // numbers
  text = text.replace(/^\s*[-*+]\s+/gm, "");  // bullets

  // Remove LaTeX equations
  text = text.replace(/\$.*?\$/g, "");        // inline math
  text = text.replace(/\\\[.*?\\\]/gs, "");   // display math

  // Remove extra whitespace and line breaks
  text = text.replace(/\s+/g, " ").trim();

  return text;
}


// Chat endpoint
router.post("/", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({ reply: "No message provided." });
    }

    console.log("Sending prompt to AI:", message);

    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mistral:7b-instruct-q4_0",
        prompt: message,
        stream: false,
        num_predict: 50
      }),
      timeout: 10000,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("AI server returned error:", response.status, text);
      return res.status(response.status).json({
        reply: `AI server error ${response.status}: ${text}`,
      });
    }


    const data = await response.json();

    if (!data || !data.response) {
      console.warn("AI server returned empty response:", data);
      return res.status(500).json({ reply: "AI server returned no response." });
    }

    res.json({ reply: cleanAIResponse(data.response) });
  } catch (err) {
    console.error("Chatbot fetch error:", err.message);
    res.status(500).json({
      reply: `Could not reach AI server: ${err.message}. Make sure Ollama is running and the model is installed.`,
    });
  }
});

module.exports = router; // <-- CHANGE HERE
