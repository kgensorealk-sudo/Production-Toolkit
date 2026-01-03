
import { createClient } from '@supabase/supabase-js';

// Project ID: jtrvpqxhjqpifglrhbzu
const supabaseUrl = 'https://jtrvpqxhjqpifglrhbzu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0cnZwcXhoanFwaWZnbHJoYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODI2MDcsImV4cCI6MjA4Mjc1ODYwN30.5uPoLzqW6GW4yY14mgA9rBcWgZOnPYom7LbLIQOkDao';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
