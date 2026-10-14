import { AuthForm } from '@/components/auth-form';
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm
      initialMode={params.mode === 'update' ? 'update' : 'login'}
      initialError={params.error}
    />
  );
}
