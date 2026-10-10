// Static file server for a built export (used by Playwright and `npm start`).
// It applies the same rewrite as production hosting: /adventure/** -> /adventure/index.html,
// because adventure ids only exist at runtime. Contains no app logic and no data endpoints.
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

const ROOT = resolve(process.argv[2] ?? "out");
const PORT = Number(process.argv[3] ?? process.env.PORT ?? 3000);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain" };

function fileFor(pathname) {
  const file = resolve(join(ROOT, decodeURIComponent(pathname)));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return null;
  const f = existsSync(file) && statSync(file).isDirectory() ? join(file, "index.html") : file;
  return existsSync(f) && statSync(f).isFile() ? f : null;
}

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://x");
  let file = fileFor(pathname);
  if (!file && pathname.startsWith("/adventure/") && !pathname.includes("_next") && !extname(pathname)) file = fileFor("/adventure/");
  if (!file) {
    res.writeHead(404, { "content-type": TYPES[".html"] });
    return existsSync(join(ROOT, "404.html")) ? createReadStream(join(ROOT, "404.html")).pipe(res) : res.end("Not found");
  }
  const ext = extname(file);
  res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": file.endsWith("sw.js") || ext === ".html" ? "no-cache" : "public, max-age=3600" });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Serving ${ROOT} on http://localhost:${PORT}`));
