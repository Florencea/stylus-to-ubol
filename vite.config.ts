import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  optimizeDeps: {
    include: ["@gorhill/ubo-core/js/static-filtering-parser.js"],
  },
});
