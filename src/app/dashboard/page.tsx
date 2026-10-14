import { redirect } from 'next/navigation';
import { configured, supabase } from '@/lib/supabase/server';
import { Dashboard } from '@/components/dashboard';
import { demoDocuments } from '@/lib/demo';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const params = await searchParams;
  const demo = !configured() || params.demo === '1';
  if (demo)
    return (
      <Dashboard
        demo
        initialDocuments={demoDocuments}
        name="Alex"
        email="Demo workspace"
        attempts={[]}
        initialError={null}
      />
    );
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect('/login');
  const [{ data: documents, error }, { data: attempts, error: attemptError }] = await Promise.all([
    db
      .from('documents')
      .select('id,title,subject,status,created_at,summary,error')
      .order('created_at', { ascending: false }),
    db.from('quiz_attempts').select('score,total').eq('user_id', user.id),
  ]);
  return (
    <Dashboard
      demo={false}
      initialDocuments={documents || []}
      name={user.email?.split('@')[0] || 'Learner'}
      email={user.email || ''}
      attempts={attempts || []}
      initialError={
        error || attemptError
          ? 'Could not load your workspace. Check the Supabase migration and connection.'
          : null
      }
    />
  );
}
