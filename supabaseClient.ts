
import { createClient } from '@supabase/supabase-js';

// Project ID: jtrvpqxhjqpifglrhbzu
const supabaseUrl = 'https://jtrvpqxhjqpifglrhbzu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0cnZwcXhoanFwaWZnbHJoYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODI2MDcsImV4cCI6MjA4Mjc1ODYwN30.5uPoLzqW6GW4yY14mgA9rBcWgZOnPYom7LbLIQOkDao';

/**
 * Hardened Supabase Client for Desktop/Long-session environments.
 * Uses keep-alive to prevent the connection from being dropped by the OS or firewalls.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: window.localStorage,
    flowType: 'pkce'
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  },
  global: {
    headers: { 'x-application-name': 'production-toolkit-pro' },
    fetch: (url, options) => {
      return fetch(url, {
        ...options,
        keepalive: true, // Crucial for ensuring requests finish if app is hidden
      });
    }
  }
});
