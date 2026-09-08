import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';

// Copies static files that Vite does not process (plain scripts,
// shared CSS, standalone app HTML files) into the dist output.
function copyStatic() {
  return {
    name: 'copy-static',
    closeBundle() {
      const root = resolve(__dirname, '.');
      const dist = resolve(__dirname, 'dist');
      const items = ['assets', 'apps', 'crt-theme.css', 'favicon.ico', 'favicon.png'];
      for (const item of items) {
        try {
          cpSync(resolve(root, item), resolve(dist, item), { recursive: true });
        } catch (e) {
          // Missing optional files are not fatal
        }
      }
    }
  };
}

export default defineConfig({
  root: '.',
  publicDir: false,
  plugins: [copyStatic()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'index.html'
      }
    }
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
});