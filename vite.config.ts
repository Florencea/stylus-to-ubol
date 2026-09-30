import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
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
