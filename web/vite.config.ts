import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

const PORT = parseInt(process.env["PORT"] ?? "3000", 10)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src/client") } },
  server: {
    // 告诉 Vite HMR 客户端连回外层 Bun 代理端口
    hmr: { clientPort: PORT },
  },
})
