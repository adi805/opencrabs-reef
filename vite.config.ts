import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': { target: 'http://127.0.0.1:4187', changeOrigin: false },
    },
  },
  preview: {
    host: '127.0.0.1',
    proxy: {
      '/api': { target: 'http://127.0.0.1:4187', changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    // Source maps cost 10.5 MB per build and the deployed demo is read-only
    // eye-candy; a stack trace from a minified town frame is not a debugging
    // surface anyone is going to use on a 1 GB VPS.
    sourcemap: false,
  },
});
