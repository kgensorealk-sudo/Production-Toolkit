import type { VercelRequest } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://jtrvpqxhjqpifglrhbzu.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0cnZwcXhoanFwaWZnbHJoYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODI2MDcsImV4cCI6MjA4Mjc1ODYwN30.5uPoLzqW6GW4yY14mgA9rBcWgZOnPYom7LbLIQOkDao';
// Admin status is no longer hardcoded by email. It is driven entirely by:
//   1. auth.users.app_metadata.role === 'admin'  (server/service-role settable only)
//   2. profiles.role === 'admin'                 (DB column, protect with RLS)
// Deliberately NOT checking user_metadata here — that object is client-editable
// via the Supabase JS SDK, so trusting it would let any signed-in user grant
// themselves admin from the browser.

export async function verifySubscriptionAccess(req: VercelRequest): Promise<{ authorized: boolean; error?: string; status?: number; user?: any }> {
  try {
    const authHeader = (req.headers.authorization || req.headers['authorization']) as string | undefined;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        authorized: false,
        status: 401,
        error: 'Authentication required. Keeper AI is only available to users with an active subscription.'
      };
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return {
        authorized: false,
        status: 401,
        error: 'Authentication token missing. Please sign in to chat with Keeper.'
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return {
        authorized: false,
        status: 401,
        error: 'Invalid or expired authentication session. Please sign in again.'
      };
    }

    const isAdmin = user.app_metadata?.role?.toLowerCase() === 'admin';

    if (isAdmin) {
      return { authorized: true, user };
    }

    // Check user profile in database for subscription status
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, role, is_subscribed, subscription_end, subscription_tier')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.role?.toLowerCase() === 'admin') {
      return { authorized: true, user };
    }

    let isSubscribed = Boolean(profile?.is_subscribed);
    if (profile?.subscription_end && new Date(profile.subscription_end) < new Date()) {
      isSubscribed = false;
    }

    if (!isSubscribed) {
      return {
        authorized: false,
        status: 403,
        error: 'Subscription required. Keeper AI only responds to users with an active subscription.'
      };
    }

    return { authorized: true, user };
  } catch (err: any) {
    console.error('Error verifying subscription access for Keeper AI:', err);
    return {
      authorized: false,
      status: 500,
      error: 'Unable to verify subscription status. Please try again.'
    };
  }
}
