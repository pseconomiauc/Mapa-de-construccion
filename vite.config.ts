import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = process.env.GITHUB_ACTIONS && repositoryName ? `/${repositoryName}/` : '/';

// https://vitejs.dev/config/
export default defineConfig({
  base,
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
