
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // Vercel automatically sets the VERCEL environment variable to '1'
  const isVercel = process.env.VERCEL === '1';

  return {
    plugins: [react()],
    // Electron requires relative paths ('./') to load assets from the file system.
    // Vercel/Web hosting typically behaves better with absolute paths ('/').
    base: isVercel ? '/' : './', 
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      port: 5173
    },
    // Expose env variables to the client-side code
    // On Vercel, ensure you add API_KEY in the Project Settings > Environment Variables
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY),
    },
  };
});
