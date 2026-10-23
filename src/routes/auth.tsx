import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { LockKeyhole, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { privatePasswordAuth } from '@/lib/private-auth.functions';

export const Route = createFileRoute('/auth')({
  head: () => ({ meta: [
    { title: 'Private sign-in · LinkedIn Measuring Tool' },
    { name: 'description', content: 'Private email and password access to LinkedIn Measuring Tool.' },
    { property: 'og:title', content: 'Private sign-in · LinkedIn Measuring Tool' },
    { property: 'og:description', content: 'Private access for approved accounts only.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'robots', content: 'noindex, nofollow' },
  ] }),
  component: Auth,
});
function Auth() {
  const navigate = useNavigate();
  const authenticate = useServerFn(privatePasswordAuth);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [invitation, setInvitation] = useState(false);
  useEffect(() => {
    const isInvite = new URLSearchParams(window.location.hash.slice(1)).get('type') === 'invite';
    if (isInvite) setInvitation(true);
  }, []);
  return <main className="auth-page"><div className="auth-form">
    <LockKeyhole className="text-primary mb-6" size={26} strokeWidth={1.5} />
    <h1 className="font-editorial text-2xl font-bold">LinkedIn Measuring Tool</h1>
    <p className="mt-3 mb-8 text-muted-foreground">{invitation ? 'Set your password to complete your private account.' : mode === 'signin' ? 'Sign in to your private workspace.' : 'Create your private account.'}</p>
    <form className="grid gap-5" onSubmit={async event => { event.preventDefault(); setBusy(true); setMessage(''); try {
      if (invitation) {
        const { data: user, error: userError } = await supabase.auth.getUser();
        const { data: allowed } = await supabase.rpc('is_allowed_user');
        if (userError || !user.user || !allowed) { setMessage('This tool is private.'); return; }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) { setMessage('Your password could not be saved. Please try again.'); return; }
        window.history.replaceState(null, '', '/auth');
        await navigate({ to: '/', replace: true });
        return;
      }
      const result = await authenticate({ data: { mode, email, password: mode === 'signup' ? 'invitation-only' : password, origin: window.location.origin } });
      if (result.error) { setMessage(result.error); return; }
      if (result.session) { const { error } = await supabase.auth.setSession(result.session); if (error) { setMessage('Sign-in could not be completed. Please try again.'); return; } await navigate({ to: '/', replace: true }); }
      else setMessage('message' in result ? result.message ?? '' : 'Check your email to confirm your account.');
    } catch { setMessage('Private access is unavailable. Please try again.'); } finally { setBusy(false); } }}>
      {!invitation && <label className="grid gap-2 text-sm">Email<Input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>}
      {(invitation || mode === 'signin') && <label className="grid gap-2 text-sm">Password<Input type="password" autoComplete={invitation ? 'new-password' : 'current-password'} minLength={8} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></label>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      <Button type="submit" disabled={busy}><LogIn />{busy ? 'Please wait…' : invitation ? 'Set password' : mode === 'signin' ? 'Sign in' : 'Create account'}</Button>
      {!invitation && <Button type="button" variant="link" disabled={busy} onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(''); }}>{mode === 'signin' ? 'Create an account' : 'Back to sign in'}</Button>}
    </form>
  </div></main>;
}
