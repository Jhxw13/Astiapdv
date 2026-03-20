import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // CRÍTICO: './' quebra quando servido via HTTP (IP:3567)
  // '/' funciona tanto no Electron (loadURL http://localhost:3567) quanto no browser (http://IP:3567)
  base: '/',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(warning);
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true, // permite acesso na rede local em dev
    hmr: { overlay: false },
  },
}));
