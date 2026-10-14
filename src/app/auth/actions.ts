'use server';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase/server';
import { z } from 'zod';
export async function authenticate(
  _: { error?: string; message?: string },
  form: FormData,
): Promise<{ error?: string; message?: string }> {
  const parsed = z
    .object({
      email: z.email(),
      password: z.string().max(128),
      mode: z.enum(['login', 'signup', 'reset', 'update']),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: 'Use a valid email and a password of at least 8 characters.' };
  try {
    const db = await supabase();
    const { email, password, mode } = parsed.data;
    if (mode !== 'reset' && password.length < 8)
      return { error: 'Password must contain at least 8 characters.' };
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000';
    if (mode === 'reset') {
      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?next=/login?mode=update`,
      });
      if (error) return { error: error.message };
      return { message: 'If this account exists, a reset link has been sent.' };
    }
    if (mode === 'update') {
      const {
        data: { user },
      } = await db.auth.getUser();
      if (!user) return { error: 'Open the reset link from your email first.' };
      const { error } = await db.auth.updateUser({ password });
      if (error) return { error: error.message };
      return { message: 'Password updated. You can open your dashboard.' };
    }
    const { data, error } =
      mode === 'signup'
        ? await db.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${origin}/auth/callback` },
          })
        : await db.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (!data.session)
      return { message: 'Check your email to confirm your account, then sign in.' };
  } catch {
    return { error: 'Authentication is not available. Check your Supabase configuration.' };
  }
  redirect('/dashboard');
}
export async function signOut() {
  const db = await supabase();
  await db.auth.signOut();
  redirect('/login');
}
