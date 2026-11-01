import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `mode` is "development" for `npm run dev`, "production" for `npm run build`, and "mock" for
// `npm run dev:mock` / `build:mock` (which also loads .env.mock and so sets VITE_MOCK=1).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    // While coding against the real server, Vite (port 5173) forwards these paths to Express (3000),
    // so the browser sees one address and the login cookie just works. In mock mode there is no
    // server, so nothing is forwarded.
    proxy:
      mode === 'mock'
        ? undefined
        : {
            '/api': 'http://localhost:3000',
            '/auth': 'http://localhost:3000',
            // A regex key: a plain '/scan' would also swallow our own '/scan-failed' page.
            '^/scan(\\?.*)?$': 'http://localhost:3000',
          },
  },
}))
