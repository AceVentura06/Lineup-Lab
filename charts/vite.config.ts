import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Builds one ES module + one stylesheet into ../assets/charts, which index.html loads on demand.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "../assets/charts",
    emptyOutDir: true,
    cssCodeSplit: false,
    rolldownOptions: {
      input: "src/main.tsx",
      output: {
        format: "es",
        entryFileNames: "islands.js",
        assetFileNames: "islands[extname]",
        // Bklit finds its chart parts by component name, so names must survive minification
        keepNames: true,
      },
    },
  },
});
