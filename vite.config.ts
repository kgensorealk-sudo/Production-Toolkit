
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    // Using an empty string for base ensures that assets are linked relatively.
    // This is the "magic" setting that allows the same build to work on both
    // standard web servers (Vercel) and local filesystems (Electron .exe).
    base: '', 
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      assetsDir: 'assets',
    },
    server: {
      port: 5173
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY || ""),
    },
  };
});
