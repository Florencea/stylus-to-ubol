import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV ?? "development",
    ),
  },
  optimizeDeps: {
    include: ["@gorhill/ubo-core/js/static-filtering-parser.js"],
  },
  build: {
    target: "esnext",
  },
});
