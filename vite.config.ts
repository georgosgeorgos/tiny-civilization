import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Keep application code cacheable separately from the rendering engine.
        manualChunks: {
          three: ["three"],
        },
      },
    },
  },
});
