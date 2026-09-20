import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/Mapa-de-construccion/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    // Leaflet + XLSX son librerías grandes; subir el límite para evitar advertencias innecesarias
    chunkSizeWarningLimit: 1200
  }
});
