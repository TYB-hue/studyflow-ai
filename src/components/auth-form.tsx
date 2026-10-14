'use client';
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight, BookOpen, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authenticate } from '@/app/auth/actions';
export function AuthForm({
  initialMode,
  initialError,
}: {
  initialMode: string;
  initialError?: string;
}) {
  const [mode, setMode] = useState(initialMode);
  const [state, action, pending] = useActionState(authenticate, { error: initialError });
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Sparkles size={23} />
          </span>
          StudyFlow<span className="brand-ai">AI</span>
        </Link>
        <div>
          <span className="eyebrow">A LITTLE CLARITY. A LOT OF PROGRESS.</span>
          <h1>
            Your next
            <br />
            lightbulb moment
            <br />
            <em>starts here.</em>
          </h1>
          <p>Turn the material you have into the understanding you need.</p>
          <div className="auth-benefits">
            {[
              'Answers grounded in your notes',
              'Quizzes that make knowledge stick',
              'Your entire study world, in one place',
            ].map((x) => (
              <div key={x}>
                <CheckCircle2 size={19} />
                {x}
              </div>
            ))}
          </div>
        </div>
        <span className="muted">Built for curious minds.</span>
      </section>
      <section className="auth-form">
        <div className="auth-box">
          <BookOpen className="text-violet-600" size={32} />
          <h2>
            {mode === 'signup'
              ? 'Make room for better learning'
              : mode === 'reset'
                ? 'Reset your password'
                : mode === 'update'
                  ? 'Choose a new password'
                  : 'Welcome back'}
          </h2>
          <p className="muted">
            {mode === 'signup'
              ? 'Create your free StudyFlow account.'
              : 'Your next study session is waiting.'}
          </p>
          <form action={action}>
            <input type="hidden" name="mode" value={mode} />
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@university.edu"
              />
            </label>
            {mode !== 'reset' && (
              <label>
                {mode === 'update' ? 'New password' : 'Password'}
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  maxLength={128}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  placeholder="At least 8 characters"
                />
              </label>
            )}
            {state.error && (
              <p role="alert" className="error">
                {state.error}
              </p>
            )}
            {state.message && (
              <p role="status" className="notice">
                {state.message}
              </p>
            )}
            <Button disabled={pending} className="w-full">
              {pending
                ? 'One moment…'
                : mode === 'signup'
                  ? 'Create free account'
                  : mode === 'reset'
                    ? 'Send reset link'
                    : mode === 'update'
                      ? 'Update password'
                      : 'Sign in'}
              <ArrowRight size={17} />
            </Button>
          </form>
          <div className="auth-links">
            <button onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
              {mode === 'signup'
                ? 'Already have an account? Sign in'
                : 'New here? Create an account'}
            </button>
            <button onClick={() => setMode('reset')}>Forgot your password?</button>
          </div>
          <Link href="/dashboard?demo=1" className="demo-link">
            Explore the demo first →
          </Link>
        </div>
      </section>
    </main>
  );
}
