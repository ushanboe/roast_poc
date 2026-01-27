export default function handler(req, res) {
  res.status(200).json({ ok: true, version: `vercel-${new Date().toISOString()}` });
}
