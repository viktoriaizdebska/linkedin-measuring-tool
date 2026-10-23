import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';

// Cloud did not generate a layout when enabled; this client-only gate matches its managed pattern.
export const Route = createFileRoute('/_authenticated')({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: '/auth' });
    const { data: allowed, error: allowedError } = await supabase.rpc('is_allowed_user');
    if (allowedError || !allowed) {
      await supabase.auth.signOut();
      throw redirect({ to: '/auth' });
    }
  },
  component: () => <Outlet />,
});
