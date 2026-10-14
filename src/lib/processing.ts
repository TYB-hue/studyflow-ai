import 'server-only';
import { supabase } from '@/lib/supabase/server';
import { extract, embed } from '@/lib/ai';
import { chunkPages } from '@/lib/core';
import { ApiError } from '@/lib/api';
export async function processDocument(
  db: Awaited<ReturnType<typeof supabase>>,
  doc: { id: string; user_id: string; mime_type: string },
  bytes: Buffer,
) {
  try {
    const pages = await extract(bytes, doc.mime_type);
    const chunks = chunkPages(pages);
    const rows = [];
    // Limit concurrency to avoid embedding provider bursts.
    for (let i = 0; i < chunks.length; i += 4) {
      rows.push(
        ...(await Promise.all(
          chunks.slice(i, i + 4).map(async (chunk, j) => ({
            ...chunk,
            document_id: doc.id,
            user_id: doc.user_id,
            chunk_index: i + j,
            embedding: await embed(chunk.content, 'RETRIEVAL_DOCUMENT'),
          })),
        )),
      );
    }
    const { error } = await db.rpc('finish_processing', { doc_id: doc.id, rows });
    if (error) throw error;
  } catch (error) {
    await db
      .from('documents')
      .update({
        status: 'failed',
        error:
          error instanceof ApiError
            ? error.message.slice(0, 220)
            : 'Document processing could not finish. Please retry; if it continues, try a smaller PDF.',
      })
      .eq('id', doc.id);
    throw error;
  }
}
