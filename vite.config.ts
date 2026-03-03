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
      port: 3000,
      host: '0.0.0.0'
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY || ""),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || ""),
      'process.env.VITE_GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || ""),
    },
  };
});