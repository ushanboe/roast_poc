import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-friendly config:
// - bind to 0.0.0.0 so phones on LAN can connect
// - proxy /api to the local backend so the frontend can use relative URLs
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
