import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize, ownedDocument, fail, ApiError, consume } from '@/lib/api';
import { processDocument } from '@/lib/processing';
export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };
export async function DELETE(request: Request, context: Context) {
  try {
    const { db } = await authorize(request);
    const { id } = await context.params;
    z.uuid().parse(id);
    const doc = await ownedDocument(db, id);
    if (doc.status === 'processing')
      throw new ApiError('Wait for processing to finish before deleting.', 409);
    const { error: storageError } = await db.storage
      .from('study-materials')
      .remove([doc.storage_path]);
    if (storageError) throw storageError;
    const { error } = await db.from('documents').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const { db } = await authorize(request);
    const { id } = await context.params;
    z.uuid().parse(id);
    const doc = await ownedDocument(db, id);
    await consume(db, 'ai');
    const { data: claimed, error: claimError } = await db.rpc('claim_processing', { doc_id: id });
    if (claimError || !claimed)
      throw new ApiError(
        'Processing is active. Retry failed files or wait 10 minutes after an interrupted upload.',
        409,
      );
    const { data, error } = await db.storage.from('study-materials').download(doc.storage_path);
    if (error || !data) {
      await db
        .from('documents')
        .update({ status: 'failed', error: 'Stored file is unavailable.' })
        .eq('id', id);
      throw new ApiError('Stored file is unavailable.', 404);
    }
    await processDocument(db, doc, Buffer.from(await data.arrayBuffer()));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
