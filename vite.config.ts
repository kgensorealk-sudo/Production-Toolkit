import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // Check if running in Electron mode via environment variable
  const isElectron = process.env.ELECTRON_BUILD === '1' || mode === 'production';

  return {
    plugins: [react()],
    // For Electron (.exe), assets MUST use relative paths './' to work on filesystem.
    // For standard web hosting, use '/'.
    base: isElectron ? './' : '/', 
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