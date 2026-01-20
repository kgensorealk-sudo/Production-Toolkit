import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    // Base '' ensures relative paths for .exe compatibility
    base: '', 
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      assetsDir: 'assets',
      target: 'esnext',
      sourcemap: mode === 'development',
      minify: 'esbuild',
    },
    server: {
      port: 5173
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY || ""),
    },
  };
});