import 'server-only';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/server';
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function authorize(request: Request) {
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin)
      throw new ApiError('Request origin is not allowed.', 403);
  }
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new ApiError('Please sign in to continue.', 401);
  return { db, user };
}
export async function consume(db: Awaited<ReturnType<typeof supabase>>, kind: 'ai' | 'upload') {
  const { data, error } = await db.rpc('consume_quota', { kind });
  if (error)
    throw new ApiError('Unable to check usage. Ensure the database migration is applied.', 503);
  if (!data)
    throw new ApiError(
      kind === 'ai'
        ? 'Daily study limit reached. Try again tomorrow.'
        : 'Upload limit reached: 20 documents in your library or 20 uploads today. Delete a document or try again tomorrow.',
      429,
    );
}
export function fail(error: unknown) {
  if (error instanceof ApiError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.includes('not configured'))
    return NextResponse.json({ error: error.message }, { status: 503 });
  console.error('StudyFlow request failed:', error instanceof Error ? error.name : 'unknown');
  return NextResponse.json(
    { error: 'The request could not be completed. Check provider configuration or try again.' },
    { status: 500 },
  );
}
export async function ownedDocument(db: Awaited<ReturnType<typeof supabase>>, id: string) {
  const { data, error } = await db.from('documents').select('*').eq('id', id).single();
  if (error || !data) throw new ApiError('Document not found.', 404);
  return data;
}

export async function boundedBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError('Request body is missing.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError('Request is too large.', 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function readJson(request: Request) {
  const bytes = await boundedBody(request, 16384);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new ApiError('Invalid JSON body.');
  }
}
