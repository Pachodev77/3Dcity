import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './', // Usar rutas relativas
  publicDir: 'public',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    },
    // Asegurar que los archivos estáticos se copien correctamente
    assetsInlineLimit: 0 // Desactivar la conversión de assets a base64
  },
  // Configuración para servir archivos estáticos
  optimizeDeps: {
    exclude: ['three']
  },
  // Asegurar que los archivos .glb se sirvan con el tipo MIME correcto
  server: {
    fs: {
      strict: false
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  }
});
