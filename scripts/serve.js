import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DEFAULT_SITE_DIR = path.join(ROOT_DIR, "src");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const resolveSafePath = (rootDir, requestUrl) => {
  const url = new URL(requestUrl ?? "/", "http://127.0.0.1");
  const rawPathname = decodeURIComponent(url.pathname);
  const relativePath =
    rawPathname === "/" ? "index.html" : rawPathname.replace(/^\/+/, "");
  const normalizedRoot = path.resolve(rootDir);
  const resolved = path.resolve(normalizedRoot, relativePath);

  if (
    resolved !== normalizedRoot &&
    !resolved.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    return null;
  }
  return resolved;
};

export const startStaticServer = async ({
  rootDir = DEFAULT_SITE_DIR,
  port = 4173,
  host = "127.0.0.1",
} = {}) => {
  const server = http.createServer((req, res) => {
    const filePath = resolveSafePath(rootDir, req.url);
    if (filePath === null) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    void readFile(filePath)
      .then((content) => {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
        res.writeHead(200, { "Content-Type": contentType });
        res.end(content);
      })
      .catch(() => {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
      });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to determine server address.");
  }

  const url = `http://${host}:${address.port}`;
  const close = async () => {
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err !== undefined) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  };

  return { server, url, close };
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  const { url, close } = await startStaticServer({
    rootDir: DEFAULT_SITE_DIR,
    port: Number(process.env.PORT ?? 4173),
  });
  console.log(`Serving src/ at ${url}`);

  const shutdown = () => {
    void close().finally(() => {
      process.exit(0);
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
