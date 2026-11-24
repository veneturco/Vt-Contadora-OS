import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('jspdf')) return 'vendor-pdf';
            if (id.includes('tesseract')) return 'vendor-ocr';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('jsqr')) return 'vendor-qr';
            if (id.includes('react-dom') || id.includes('react/')) return 'vendor-react';
          }
          return undefined;
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/webhooks': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
});
