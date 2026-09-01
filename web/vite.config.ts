import path from 'path';
import { writeFileSync } from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Identifica este build para que el panel pueda avisar "hay una versión nueva" — sin esto, una
// pestaña abierta desde antes de un despliegue sigue corriendo el JS viejo indefinidamente (una
// SPA no se actualiza sola solo porque el servidor cambió), y el síntoma es confuso: un arreglo
// que "no funcionó" cuando en realidad nunca llegó a esa pestaña. Ver useVersionCheck.ts.
const buildId = String(Date.now());

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'emit-build-id',
      closeBundle() {
        writeFileSync(path.resolve(__dirname, 'dist/version.json'), JSON.stringify({ buildId }));
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
});
