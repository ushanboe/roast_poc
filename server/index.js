const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const { z } = require("zod");

// Ensure we load server/.env even when the process is started from repo root.
dotenv.config({ path: path.join(__dirname, ".env") });

const SERVER_VERSION = `server-${new Date().toISOString()}`;

const app = express();
app.use(cors());

// Allow fairly large screenshots (base64). Adjust if needed.
app.use(express.json({ limit: "15mb" }));

const RoastReq = z.object({
  imageDataUrl: z.string().startsWith("data:image/"),
  tone: z.string().min(1).max(40).default("Brutal"),
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, version: SERVER_VERSION });
});

app.post("/api/roast", async (req, res) => {
  res.setHeader("X-Server-Version", SERVER_VERSION);
  try {
    const parsed = RoastReq.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "bad_request", details: parsed.error.flatten() });
    }

    const { imageDataUrl, tone } = parsed.data;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "missing_config",
        message: "Set OPENAI_API_KEY in server/.env",
      });
    }

    // Split data URL
    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: "bad_image" });
    const mime = match[1];
    const b64 = match[2];

    // Use OpenAI Responses API with vision-capable model.
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "You are a witty comedian. You roast the USER'S MOBILE SCREENSHOT in a playful, non-hateful way. Never include slurs. Avoid harassment. Do not mention real private data. Do NOT include the app name, headings, or any scores/ratings inside the roast text. If the screenshot appears to include private chats or personal info, warn the user to crop/blur next time and keep the roast generic. Output JSON only.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  `Tone: ${tone}. Produce: (1) a short roast (max 4 lines), (2) a score 0-100 (chaosScore), (3) 3 short tags. Return JSON ONLY with exactly these keys: roast, chaosScore, tags.`,
              },
              {
                type: "input_image",
                image_url: `data:${mime};base64,${b64}`,
              },
            ],
          },
        ],
        // Encourage the model to stick to JSON
        text: { format: { type: "json_object" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: "upstream_error", status: response.status, errText });
    }

    const data = await response.json();

    function extractOutputText(resp) {
      if (typeof resp?.output_text === "string" && resp.output_text.length) return resp.output_text;

      // Responses API often returns structured output[] with content blocks.
      const out = resp?.output;
      if (Array.isArray(out)) {
        const chunks = [];
        for (const item of out) {
          const content = item?.content;
          if (!Array.isArray(content)) continue;
          for (const c of content) {
            // Common shapes: {type:"output_text", text:"..."} or {type:"text", text:"..."}
            if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string") {
              chunks.push(c.text);
            }
          }
        }
        if (chunks.length) return chunks.join("\n");
      }

      // Fallbacks
      if (typeof resp?.text === "string") return resp.text;
      return "";
    }

    // Try to pull JSON text from the response
    const outputText = extractOutputText(data);
    if (!outputText) {
      return res.json({
        roast: "(No text returned from model — check model response format)",
        chaosScore: null,
        tags: [],
        _debug: { version: SERVER_VERSION, note: "empty_outputText" },
      });
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(outputText);
    } catch {
      // fallback: return raw text
      return res.json({ roast: outputText, chaosScore: null, tags: [], _debug: { version: SERVER_VERSION, note: "non_json_output" } });
    }

    // Normalize/validate shape (some models may omit fields)
    const RoastResp = z
      .object({
        roast: z.string().optional(),
        chaosScore: z.number().int().min(0).max(100).optional(),
        tags: z.array(z.string()).optional(),
      })
      .passthrough();

    const normalized = RoastResp.parse(parsedJson);

    res.json({
      roast:
        typeof normalized.roast === "string" && normalized.roast.trim().length
          ? normalized.roast
          : "(No roast text returned — try a different screenshot or tone)",
      chaosScore: Number.isFinite(normalized.chaosScore) ? normalized.chaosScore : null,
      tags: Array.isArray(normalized.tags) ? normalized.tags.slice(0, 6) : [],
      _debug: { version: SERVER_VERSION },
    });
  } catch (e) {
    res.status(500).json({ error: "server_error", message: e?.message || String(e) });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on http://localhost:${port} (bound 0.0.0.0)`);
});
