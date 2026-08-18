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
