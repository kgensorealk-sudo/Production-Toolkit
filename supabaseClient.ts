
import { createClient } from '@supabase/supabase-js';

// Project ID: jtrvpqxhjqpifglrhbzu
const supabaseUrl = 'https://jtrvpqxhjqpifglrhbzu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0cnZwcXhoanFwaWZnbHJoYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODI2MDcsImV4cCI6MjA4Mjc1ODYwN30.5uPoLzqW6GW4yY14mgA9rBcWgZOnPYom7LbLIQOkDao';

/**
 * PRODUCTION READY: Cloud-Optimized Supabase Client.
 * Re-enabled detectSessionInUrl for Vercel/Web auth compatibility.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // Crucial for Vercel/Web login flows
    storage: window.localStorage,
    flowType: 'pkce'
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  },
  global: {
    headers: { 'x-application-name': 'production-toolkit-pro-web' },
    fetch: (url, options) => {
      return fetch(url, {
        ...options,
        keepalive: true, // Ensures requests complete during tab transitions
      });
    }
  }
});
