import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  optimizeDeps: {
    include: ["@gorhill/ubo-core/js/static-filtering-parser.js"],
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "ubo-core",
              test: /node_modules\/@gorhill\/ubo-core/,
            },
            {
              name: "css-tree",
              test: /node_modules\/css-tree/,
            },
          ],
        },
      },
    },
  },
});
