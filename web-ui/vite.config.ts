import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const h = process.env.HOST || '0.0.0.0';
const DEV_PORT = Number(process.env.PORT || 5173);
const PREV_PORT = Number(process.env.PREVIEW_PORT || 4173);

export default defineConfig({
  plugins: [sveltekit()],
  server: { host: h, port: DEV_PORT, strictPort: true, allowedHosts: true },
  preview: { host: h, port: PREV_PORT, strictPort: true, allowedHosts: true }
});
