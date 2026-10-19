import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@codemirror/') || id.includes('node_modules/@lezer/'))
            return 'code-editor'
          if (/node_modules\/(framer-motion|motion-dom|motion-utils)\//.test(id)) return 'motion'
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
        }
      }
    }
  },
  server: {
    proxy: { '/api': 'http://localhost:8080', '/ws': { target: 'http://localhost:8080', ws: true } }
  },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' }
})
