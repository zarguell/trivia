/** Local preview that mirrors GitHub Pages: serves dist/ at /trivia/. */
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const BASE = "/trivia/";
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

http.createServer(async (req, res) => {
  let url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (url === "/") { res.writeHead(302, { location: BASE }); return res.end(); }
  if (!url.startsWith(BASE)) { res.writeHead(404); return res.end("Not found"); }
  let rel = url.slice(BASE.length);
  if (rel.endsWith("/") || rel === "") rel += "index.html";
  let file = path.join(DIST, rel);
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    try {
      const body = await readFile(path.join(DIST, "404.html"));
      res.writeHead(404, { "content-type": TYPES[".html"] });
      res.end(body);
    } catch { res.writeHead(404); res.end("Not found"); }
  }
}).listen(PORT, () => console.log(`http://127.0.0.1:${PORT}${BASE}`));
