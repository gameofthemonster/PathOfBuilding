import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

const API_PORT = parseInt(process.env["API_PORT"] ?? "3001", 10)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src/client") } },
  server: {
    proxy: {
      "/api": `http://localhost:${API_PORT}`,
      "/tree-assets": `http://localhost:${API_PORT}`,
    },
  },
})
