import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const credentials = z.object({ email: z.string().email().transform(s => s.trim().toLowerCase()), password: z.string().min(8).max(128), origin: z.string().url() });

export const privatePasswordAuth = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => credentials.extend({ mode: z.enum(['signin', 'signup']) }).parse(input))
  .handler(async ({ data }) => {
    const { getRequest } = await import('@tanstack/react-start/server');
    const request = getRequest();
    const origin = new URL(request.url).origin;
    if (new URL(data.origin).origin !== origin) throw new Error('Invalid return address');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    // Public signup is deliberately privileged: allowlist verification happens before any account operation.
    const { data: allowed, error: allowedError } = await supabaseAdmin.from('allowed_users').select('id').eq('email', data.email).maybeSingle();
    if (allowedError) throw new Error('Private access could not be checked. Please try again.');
    if (!allowed) return { error: 'This tool is private.', session: null };
    if (data.mode === 'signup') {
      // No password is set until the email owner accepts the invitation.
      const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, { redirectTo: origin + '/auth' });
      if (error || !invited.user) return { error: 'An account may already exist. Please sign in, or try again later.', session: null };
      return { error: null, session: null, message: 'Check your email to confirm your account and set your password.' };
    }
    const url = process.env['SUPABASE_URL'];
    const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
    if (!url || !key) throw new Error('Login is unavailable. Please try again.');
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith('sb_') && headers.get('Authorization') === `Bearer ${key}`) headers.delete('Authorization');
      headers.set('apikey', key);
      return fetch(input, { ...init, headers });
    } } });
    const { data: result, error } = await client.auth.signInWithPassword({ email: data.email, password: data.password });
    if (error || !result.session) return { error: 'Sign-in failed. Check your email, password and email confirmation.', session: null };
    return { error: null, session: { access_token: result.session.access_token, refresh_token: result.session.refresh_token } };
  });
