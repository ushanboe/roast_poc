import { useMemo, useRef, useState } from "react";
import "./App.css";

// Use relative /api so it works on desktop + phone (via Vite proxy in dev)
const API_BASE = "";

function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function blurDataUrl(dataUrl, blurPx = 10) {
  const img = await dataUrlToImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.filter = `blur(${Math.max(0, blurPx)}px)`;
  ctx.drawImage(img, 0, 0);
  ctx.filter = "none";

  // PNG keeps compatibility across browsers/APIs.
  return canvas.toDataURL("image/png");
}

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getDailyUsage() {
  try {
    const raw = localStorage.getItem("rms_usage");
    const obj = raw ? JSON.parse(raw) : {};
    const key = todayKey();
    const used = Number(obj[key] || 0);
    return { key, used };
  } catch {
    return { key: todayKey(), used: 0 };
  }
}

function incDailyUsage() {
  const { key, used } = getDailyUsage();
  const next = used + 1;
  const raw = localStorage.getItem("rms_usage");
  const obj = raw ? JSON.parse(raw) : {};
  obj[key] = next;
  localStorage.setItem("rms_usage", JSON.stringify(obj));
  return next;
}


export default function App() {
  const fileRef = useRef(null);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [tone, setTone] = useState("Brutal");
  const [blurEnabled, setBlurEnabled] = useState(false);
  const [blurPx, setBlurPx] = useState(10);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [shareCardDataUrl, setShareCardDataUrl] = useState("");
  const [error, setError] = useState("");
  const [debugLines, setDebugLines] = useState([]);

  const DAILY_LIMIT = 3;

  const canRoast = useMemo(() => !!imageDataUrl && !loading, [imageDataUrl, loading]);

  async function checkBackend() {
    try {
      dbg("Backend check clicked");
      const resp = await fetch(`/api/health`);
      dbg(`GET /api/health -> ${resp.status}`);
      const data = await resp.json();
      dbg(`health: ${JSON.stringify(data)}`);
    } catch (e) {
      dbg(`Backend check FAILED: ${e?.message || String(e)}`);
    }
  }

  function dbg(line) {
    const ts = new Date().toLocaleTimeString();
    setDebugLines((prev) => [`[${ts}] ${line}`, ...prev].slice(0, 80));
  }

  async function onPickFile(file) {
    setError("");
    setResult(null);
    setShareCardDataUrl("");
    dbg(`Picked file: ${file ? `${file.name} (${file.type}, ${file.size} bytes)` : "<none>"}`);
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(String(reader.result));
    reader.onerror = () => setError("Failed to read file");
    reader.readAsDataURL(file);
  }

  async function roast() {
    setLoading(true);
    setError("");
    setResult(null);
    setShareCardDataUrl("");

    const { used } = getDailyUsage();
    const remaining = Math.max(0, DAILY_LIMIT - used);
    dbg(`Daily limit: ${used}/${DAILY_LIMIT} used (${remaining} remaining)`);
    if (used >= DAILY_LIMIT) {
      const msg = `Daily limit reached (${DAILY_LIMIT}/day). Try again tomorrow.`;
      dbg(msg);
      setError(msg);
      setLoading(false);
      return;
    }

    dbg(`Roast requested. tone=${tone}, imageDataUrl=${imageDataUrl ? `${Math.round(imageDataUrl.length / 1024)}KB dataURL` : "<empty>"}, blur=${blurEnabled ? `${blurPx}px` : "off"}`);
    try {
      const url = `${API_BASE}/api/roast`;
      dbg(`POST ${url}`);

      let imageToSend = imageDataUrl;
      if (blurEnabled) {
        dbg("Applying privacy blur before upload…");
        imageToSend = await blurDataUrl(imageDataUrl, blurPx);
        dbg(`Blurred image ready (${Math.round(imageToSend.length / 1024)}KB dataURL)`);
      }

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: imageToSend, tone }),
      });

      dbg(`Response status: ${resp.status}`);
      const data = await resp.json();
      dbg(`Response JSON keys: ${data && typeof data === "object" ? Object.keys(data).join(", ") : typeof data}`);
      if (data && typeof data === "object") {
        dbg(`roast typeof=${typeof data.roast} len=${typeof data.roast === "string" ? data.roast.length : "n/a"}`);
        dbg(`raw json: ${JSON.stringify(data).slice(0, 400)}${JSON.stringify(data).length > 400 ? "…" : ""}`);
      }
      if (!resp.ok) throw new Error(data?.message || data?.error || "Request failed");
      setResult(data);
      const nowUsed = incDailyUsage();
      dbg(`Roast OK. Daily usage now: ${nowUsed}/${DAILY_LIMIT}`);
    } catch (e) {
      dbg(`Roast FAILED: ${e?.message || String(e)}`);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function renderShareCardCanvas() {
    if (!result?.roast) return null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    // Simple story-style card (1080x1920)
    canvas.width = 1080;
    canvas.height = 1920;

    // background gradient
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(1, "#1f2937");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Title
    ctx.fillStyle = "#fff";
    ctx.font = "bold 64px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("Roast My Screenshot", 80, 140);

    // Score pill
    const score = Number.isFinite(result.chaosScore) ? result.chaosScore : null;
    const pillText = score === null ? "Chaos: ?" : `Chaos: ${score}/100`;
    ctx.font = "600 44px system-ui, -apple-system, Segoe UI, Roboto";
    const tw = ctx.measureText(pillText).width;
    const px = 80;
    const py = 200;
    const ph = 70;
    const pw = tw + 60;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    roundRect(ctx, px, py, pw, ph, 18);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(pillText, px + 30, py + 50);

    // Roast text box
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    roundRect(ctx, 80, 330, 920, 520, 28);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = "500 52px system-ui, -apple-system, Segoe UI, Roboto";

    const roastLines = wrapText(ctx, result.roast, 880);
    let y = 420;
    for (const line of roastLines.slice(0, 10)) {
      ctx.fillText(line, 120, y);
      y += 70;
    }

    // Tags
    if (Array.isArray(result.tags) && result.tags.length) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "500 38px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText(result.tags.map((t) => `#${t}`).join("  "), 80, 920);
    }

    // Tiny footer
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "500 34px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("Made with Bob & Me (POC)", 80, 1840);

    return canvas;
  }

  async function previewShareCard() {
    try {
      setError("");
      dbg("Preview share card clicked");
      const canvas = await renderShareCardCanvas();
      if (!canvas) {
        dbg("No canvas returned (no roast yet?)");
        return;
      }
      const dataUrl = canvas.toDataURL("image/png");
      dbg(`Canvas toDataURL OK (${Math.round(dataUrl.length / 1024)}KB)`);
      setShareCardDataUrl(dataUrl);
    } catch (e) {
      dbg(`Preview FAILED: ${e?.message || String(e)}`);
      setError(e?.message || String(e));
    }
  }

  async function downloadShareCard() {
    try {
      setError("");
      dbg("Download share card clicked");
      const canvas = await renderShareCardCanvas();
      if (!canvas) {
        dbg("No canvas returned (no roast yet?)");
        return;
      }

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      dbg(`canvas.toBlob => ${blob ? `${blob.type}, ${blob.size} bytes` : "null"}`);
      if (!blob) throw new Error("Failed to create image (canvas.toBlob returned null)");

      const url = URL.createObjectURL(blob);
      dbg(`Created blob URL: ${url.slice(0, 32)}...`);

      const a = document.createElement("a");
      a.href = url;
      a.download = "roast-card.png";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      dbg("Triggered <a download> click");

      setTimeout(() => {
        URL.revokeObjectURL(url);
        dbg("Revoked blob URL");
      }, 2000);
    } catch (e) {
      dbg(`Download FAILED: ${e?.message || String(e)}`);
      setError(e?.message || String(e));
    }
  }

  function openShareCardInNewTab() {
    dbg("Open card in new tab clicked");
    if (!shareCardDataUrl) {
      dbg("No shareCardDataUrl yet");
      return;
    }
    const w = window.open();
    if (!w) {
      dbg("Popup blocked (window.open returned null)");
      setError("Popup blocked. Allow popups, then try again.");
      return;
    }
    w.document.write(`<img src="${shareCardDataUrl}" style="max-width:100%;height:auto"/>`);
    dbg("Wrote image into new tab");
  }

  return (
    <div className="container">
      <header>
        <h1>Roast My Screenshot (POC)</h1>
        <p className="sub">
          Upload a screenshot. Get a playful roast + chaos score. (Crop/blur private chats.)
        </p>
      </header>

      <section className="panel">
        <div className="row">
          <button
            className="primary"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
          >
            Choose screenshot
          </button>

          <button onClick={checkBackend} disabled={loading}>
            Check backend
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => onPickFile(e.target.files?.[0])}
          />

          <label className="tone">
            Tone
            <select value={tone} onChange={(e) => setTone(e.target.value)} disabled={loading}>
              <option>Brutal</option>
              <option>Friendly</option>
              <option>Aussie</option>
              <option>Corporate</option>
              <option>Shakespearean</option>
              <option>Villain Monologue</option>
            </select>
          </label>

          <label className="tone">
            Privacy blur
            <input
              type="checkbox"
              checked={blurEnabled}
              onChange={(e) => setBlurEnabled(e.target.checked)}
              disabled={loading}
            />
          </label>

          {blurEnabled ? (
            <label className="tone">
              Blur px
              <input
                type="range"
                min={0}
                max={24}
                value={blurPx}
                onChange={(e) => setBlurPx(Number(e.target.value))}
                disabled={loading}
              />
              <span style={{ opacity: 0.75 }}>{blurPx}px</span>
            </label>
          ) : null}

          <button className="primary" onClick={roast} disabled={!canRoast}>
            {loading ? "Roasting…" : "Roast it"}
          </button>

          <div className="limit">
            Daily limit: {Math.min(getDailyUsage().used, DAILY_LIMIT)}/{DAILY_LIMIT}
          </div>
        </div>

        {imageDataUrl ? (
          <div className="preview">
            <img src={imageDataUrl} alt="Screenshot preview" />
          </div>
        ) : (
          <div className="empty">No screenshot selected yet.</div>
        )}

        {error ? <div className="error">{error}</div> : null}

        {result ? (
          <div className="result">
            <div className="score">
              Chaos score: {Number.isFinite(result.chaosScore) ? `${result.chaosScore}/100` : "?"}
            </div>
            <pre className="roast">{result.roast}</pre>
            {Array.isArray(result.tags) && result.tags.length ? (
              <div className="tags">
                {result.tags.map((t) => (
                  <span className="tag" key={t}>
                    #{t}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="row" style={{ marginTop: 12 }}>
              <button onClick={previewShareCard}>Preview share card</button>
              <button onClick={downloadShareCard}>Download share card</button>
              <button onClick={openShareCardInNewTab} disabled={!shareCardDataUrl}>
                Open card in new tab
              </button>
              <button
                onClick={async () => {
                  dbg("Copy roast clicked");
                  try {
                    await navigator.clipboard.writeText(result.roast);
                    dbg("Clipboard write OK");
                  } catch (e) {
                    dbg(`Clipboard write FAILED: ${e?.message || String(e)}`);
                    setError(e?.message || String(e));
                  }
                }}
                disabled={!navigator.clipboard}
              >
                Copy roast
              </button>
            </div>

            {shareCardDataUrl ? (
              <div className="cardPreview">
                <img src={shareCardDataUrl} alt="Share card preview" />
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="debug">
        <div className="debugHeader">
          <strong>Debug log</strong>
          <button onClick={() => setDebugLines([])}>Clear</button>
        </div>
        <pre className="debugPre">{debugLines.join("\n") || "(no events yet)"}</pre>
      </section>

      <footer>
        <small>
          POC note: this sends your image to an AI model via your backend. Don’t use sensitive screenshots.
        </small>
      </footer>
    </div>
  );
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).replace(/\r/g, "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}
