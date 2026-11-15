import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// GitHub Pages sert le dépôt sous /Subway-Surferswebgl/. Surchargeable via BASE_PATH.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? process.env.BASE_PATH || '/Subway-Surferswebgl/' : '/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
  server: { host: true },
}));
