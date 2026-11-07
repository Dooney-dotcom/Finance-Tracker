import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// The CSP depends on build-time env (connect-src), so production builds carry it as a <meta>.
// Dev skips it: Vite injects inline styles/scripts for HMR.
function csp(env: Record<string, string>): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:", // data: = the TOTP QR code Supabase returns
    "font-src 'self'",
    `connect-src ${env.VITE_SUPABASE_URL} ${env.VITE_API_URL}`,
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  return {
    plugins: [react(), csp(env)],
    // Reachable from other devices on the home network (e.g. a phone), not only this Mac.
    server: { host: true },
  }
})
