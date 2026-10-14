import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize, ownedDocument, fail, ApiError } from '@/lib/api';
import { validSignature, MAX_FILE_BYTES } from '@/lib/core';
import { processDocument } from '@/lib/processing';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let ownedId: string | undefined;
  let client: Awaited<ReturnType<typeof authorize>>['db'] | undefined;
  try {
    const { db } = await authorize(request);
    client = db;
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new ApiError('Invalid document.');
    const doc = await ownedDocument(db, id);
    const { data: claimed, error } = await db.rpc('claim_processing', { doc_id: id });
    if (error || !claimed)
      throw new ApiError('This document is already ready or currently processing.', 409);
    ownedId = id;
    const { data: file, error: downloadError } = await db.storage
      .from('study-materials')
      .download(doc.storage_path);
    if (downloadError || !file)
      throw new ApiError('The private upload is incomplete. Upload the file again.');
    if (file.size !== doc.size_bytes || file.size > MAX_FILE_BYTES)
      throw new ApiError('The uploaded size does not match the selected file.');
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!validSignature(bytes, doc.mime_type))
      throw new ApiError('File content does not match its extension.');
    await processDocument(db, doc, bytes);
    return NextResponse.json({ id, status: 'ready' });
  } catch (error) {
    if (client && ownedId)
      await client
        .from('documents')
        .update({
          status: 'failed',
          error:
            error instanceof ApiError
              ? error.message
              : 'Processing could not finish. Open the document and retry.',
        })
        .eq('id', ownedId);
    return fail(error);
  }
}
