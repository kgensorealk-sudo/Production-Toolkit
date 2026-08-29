import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  const isVercel = process.env.VERCEL === '1';
  
  return {
    plugins: [react()],
    base: isVercel ? '/' : '',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      assetsDir: 'assets',
      target: 'esnext',
      sourcemap: mode === 'development',
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('router')) {
                return 'vendor-react';
              }
              if (id.includes('lucide') || id.includes('motion')) {
                return 'vendor-ui';
              }
              if (id.includes('supabase') || id.includes('google') || id.includes('diff')) {
                return 'vendor-utils';
              }
              return 'vendor-others';
            }
          }
        }
      },
      chunkSizeWarningLimit: 1000,
    },
    server: {
      port: 3000,
      host: '0.0.0.0'
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY || ""),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || ""),
      'process.env.VITE_GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || ""),
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || ""),
    },
  };
});