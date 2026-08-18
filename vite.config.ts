import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  /**
   * The native shell serves the bundle from https://localhost, where a relative
   * /api resolves to an origin that does not exist. `define` is a literal
   * substitution, so this survives minification and never touches the web
   * build (VITE_API_BASE_URL is unset there, and relative stays correct).
   */
  define: {
    __API_BASE__: JSON.stringify(process.env.VITE_API_BASE_URL ?? ''),
    __ESPN_EXTENSION_URL__: JSON.stringify(process.env.VITE_ESPN_EXTENSION_URL ?? ''),
    __ESPN_LOGIN_ENABLED__: JSON.stringify(process.env.VITE_ESPN_LOGIN_ENABLED ?? ''),
    /* Stamped at build time so a device can say which bundle it is running.
       Two rounds of this session were spent on symptoms that had already been
       fixed, because a phone was running an older bundle than the server and
       nothing on screen could tell us. */
    __BUILD_STAMP__: JSON.stringify(
      new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
    ),
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': 'http://localhost:8799',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
