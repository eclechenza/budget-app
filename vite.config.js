import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  server: { host: true },
  plugins: [
    react(),
    {
      name: 'dev-icons',
      transformIndexHtml(html) {
        if (command === 'serve') {
          return html
            .replace('/manifest.json', '/manifest.dev.json')
            .replace('/apple-touch-icon.png', '/apple-touch-icon-dev.png')
        }
        return html
      },
    },
  ],
}))
