import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const stubPath = path.resolve(__dirname, "src/stubs/node-stubs.ts");

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      path: stubPath,
      "node:path": stubPath,
      fs: stubPath,
      "node:fs": stubPath,
      url: stubPath,
      "node:url": stubPath,
      "source-map-js": stubPath,
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV ?? "development",
    ),
  },
  build: {
    target: "esnext",
  },
});
