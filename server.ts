import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Gemini
  app.post("/api/generate-query", async (req, res) => {
    try {
      const { prompt, systemInstruction } = req.body;
      
      // Prioritize GEMINI_API_KEY, then API_KEY
      const apiKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();

      if (!apiKey || apiKey === "YOUR_API_KEY") {
        console.error("Gemini API Key is missing or invalid on the server.");
        return res.status(500).json({ error: "Gemini API Key is missing or invalid on the server. Please ensure GEMINI_API_KEY is correctly set." });
      }

      console.log(`Using API Key (first 4 chars): ${apiKey.substring(0, 4)}... Length: ${apiKey.length}`);

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error Details:", JSON.stringify(error, null, 2));
      res.status(500).json({ error: error.message || "Failed to generate query" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
