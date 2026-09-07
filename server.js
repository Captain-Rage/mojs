import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "dist");
const port = Number(process.env.PORT || 3000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/api/health") return Response.json({ ok: true, app: "mojs" });

    let path = decodeURIComponent(url.pathname);
    if (path === "/" || path === "") path = "/index.html";

    let filepath = join(root, path);
    if (!filepath.startsWith(root)) {
      return new Response("Forbidden", { status: 403 });
    }
    if (existsSync(filepath) && statSync(filepath).isFile()) {
      const ext = filepath.slice(filepath.lastIndexOf(".")).toLowerCase();
      return new Response(Bun.file(filepath), {
        headers: {
          "Content-Type": MIME[ext] ?? "application/octet-stream",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    const index = join(root, "index.html");
    if (req.headers.get("accept")?.includes("text/html") && existsSync(index)) {
      return new Response(Bun.file(index), {
        headers: { "Content-Type": MIME[".html"] },
      });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`mojs serving ${root} on http://localhost:${port}`);