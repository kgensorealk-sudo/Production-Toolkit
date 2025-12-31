
import { createClient } from '@supabase/supabase-js';

// Attempt to get environment variables, fallback to provided credentials
const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

const defaultUrl = 'https://jtrvpqxhjqpifglrhbzu.supabase.co';
const defaultKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0cnZwcXhoanFwaWZnbHJoYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODI2MDcsImV4cCI6MjA4Mjc1ODYwN30.5uPoLzqW6GW4yY14mgA9rBcWgZOnPYom7LbLIQOkDao';

export const supabase = createClient(
    envUrl || defaultUrl,
    envKey || defaultKey
);
