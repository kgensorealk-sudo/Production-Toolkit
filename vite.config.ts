
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // For Electron (.exe), assets MUST use relative paths './' to work on filesystem.
  // We use relative paths for production builds to support Electron.
  const isProduction = mode === 'production';

  return {
    plugins: [react()],
    base: isProduction ? './' : '/', 
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      port: 5173
    },
    // Expose env variables to the client-side code
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY || ""),
    },
  };
});
