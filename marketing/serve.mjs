import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Math.max(1, Number(process.argv[2] || 4174));
const types = {
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      if (req.method === "POST" && url.pathname === "/save") {
        const name = (url.searchParams.get("name") || "out.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        await mkdir(join(root, "assets"), { recursive: true });
        await writeFile(join(root, "assets", name), body);
        res.writeHead(200, { "content-type": "text/plain" });
        res.end(`saved ${name} ${body.length}`);
        return;
      }
      const pathname = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      const safe = normalize(pathname).replace(/^(\.\.[\\/])+/g, "");
      const file = join(root, safe === "" ? "scene.html" : safe);
      const data = await readFile(file);
      res.writeHead(200, {
        "content-type": types[extname(file).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(data);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    }
  })
  .on("error", (err) => {
    console.error("listen failed:", err.code || err.message);
    process.exitCode = 1;
  })
  .listen(port, "127.0.0.1", function () {
    const addr = this.address();
    console.log(`scene: http://localhost:${addr.port}/scene.html`);
  });
