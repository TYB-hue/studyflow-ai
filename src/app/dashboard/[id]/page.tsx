import { redirect, notFound } from 'next/navigation';
import { configured, supabase } from '@/lib/supabase/server';
import { Workspace } from '@/components/workspace';
import { demoDocuments } from '@/lib/demo';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id.startsWith('demo-')) {
    const doc = demoDocuments.find((d) => d.id === id);
    if (!doc) notFound();
    return <Workspace demo document={doc} artifacts={[]} />;
  }
  if (!configured()) redirect('/dashboard');
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: doc } = await db.from('documents').select('*').eq('id', id).single();
  if (!doc) notFound();
  const { data: artifacts, error } = await db
    .from('study_artifacts')
    .select('id,kind,content')
    .eq('document_id', id)
    .order('created_at', { ascending: false });
  return (
    <Workspace
      demo={false}
      document={doc}
      artifacts={artifacts || []}
      initialError={error ? 'Could not load saved study resources. Please refresh.' : undefined}
    />
  );
}
