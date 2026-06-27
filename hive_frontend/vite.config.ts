import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // loadEnv pulls VITE_* (and any unprefixed vars when last arg is '') from
  // hive_frontend/.env. Vite only auto-exposes VITE_-prefixed vars to client
  // code; here we just need VITE_PORT at config time.
  const env = loadEnv(mode, process.cwd(), '')
  const port = Number(env.VITE_PORT) || 5173

  return {
    plugins: [react()],
    server: {
      port,
      strictPort: true,
    },
    preview: {
      port,
      strictPort: true,
    },
  }
})
