import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    // The package entry is one large prebuilt module. Source modules let Rollup
    // share only the renderer features used by the two app modes.
    alias: [{ find: /^three$/, replacement: "three/src/Three.js" }],
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/three/src/renderers/")) return "three-renderer";
        },
      },
    },
  },
});
