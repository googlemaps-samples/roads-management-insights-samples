import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: [
      "@deck.gl-community/editable-layers",
      "@deck.gl-community/layers",
      "deck.gl",
      "@deck.gl/core",
    ],
  },
  define: {
    global: "globalThis",
  },
  build: {
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
  worker: {
    format: "es",
    plugins: () => [],
    rollupOptions: {
      output: {
        format: "es",
      },
    },
  },
})
