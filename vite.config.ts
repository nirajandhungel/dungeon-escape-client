import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev proxy makes the API same-origin, so the session cookie works without cross-site cookie settings.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
});
