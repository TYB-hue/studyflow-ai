import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize, consume, ownedDocument, readJson, fail, ApiError } from '@/lib/api';
import { groq, embed } from '@/lib/ai';
import { studyContext } from '@/lib/study-context';
import { quizSchema, cardSchema, summarySchema, chatSchema } from '@/lib/core';
export const maxDuration = 120;
const input = z.object({
  documentId: z.uuid(),
  action: z.enum(['chat', 'summary', 'quiz', 'flashcards']),
  message: z.string().trim().min(1).max(2000).optional(),
});
export async function POST(request: Request) {
  try {
    const { db, user } = await authorize(request);
    const parsed = input.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError('Invalid study request.');
    const body = parsed.data;
    const doc = await ownedDocument(db, body.documentId);
    if (doc.status !== 'ready') throw new ApiError('This document is not ready yet.', 409);
    if (body.action === 'chat' && !body.message) throw new ApiError('Enter a question.');
    await consume(db, 'ai');
    if (body.action === 'chat') {
      const vector = await embed(body.message!, 'RETRIEVAL_QUERY');
      const { data, error } = await db.rpc('match_chunks', {
        query_embedding: vector,
        filter_document: doc.id,
        match_count: 6,
      });
      if (error) throw error;
      const sources = (data || [])
        .filter((row: { similarity: number }) => row.similarity > 0.25)
        .slice(0, 3)
        .map((row: { content: string; page: number; similarity: number }, i: number) => ({
          label: `${i + 1}`,
          page: row.page,
          content: row.content,
          similarity: row.similarity,
        }));
      if (!sources.length)
        return NextResponse.json({
          answer:
            'I could not find enough relevant evidence in this document. Try a more specific question.',
          sources: [],
        });
      const result = await groq(
        'Answer the question ' +
          JSON.stringify(body.message) +
          ' using these excerpts. Return {"answer":"... [1] ...","citations":[1]}. Cite excerpt numbers only, and include an excerpt citation for each factual claim. If the question is outside these excerpts, explain that limitation.',
        JSON.stringify(sources),
        chatSchema,
      );
      if (result.citations.some((c) => c > sources.length))
        throw new ApiError('The generated answer contained invalid citations. Please retry.', 502);
      return NextResponse.json({
        answer: result.answer,
        sources: sources.filter((_: unknown, i: number) => result.citations.includes(i + 1)),
      });
    }
    const { data: chunks, error } = await db
      .from('document_chunks')
      .select('content,page,chunk_index')
      .eq('document_id', doc.id)
      .order('chunk_index');
    if (error || !chunks?.length) throw new ApiError('Document text is unavailable.', 409);
    const context = studyContext(chunks);
    const material = context.material;
    let result;
    if (body.action === 'summary')
      result = await groq(
        'Return {"summary":"..."}. Write a clear study summary with short section headings, key concepts and a final takeaway. Cite pages as (p. 1).',
        material,
        summarySchema,
      );
    else if (body.action === 'quiz')
      result = await groq(
        'Return {"questions":[{"question":"...","options":["...","...","...","..."],"answer":0,"explanation":"... (p. 1)"}]}. Generate 5 useful multiple choice questions. Answer is a zero-based index. Include a page citation in each explanation.',
        material,
        quizSchema,
      );
    else
      result = await groq(
        'Return {"cards":[{"front":"...","back":"... (p. 1)"}]}. Generate 8 concise flashcards testing different concepts. Cite pages in backs.',
        material,
        cardSchema,
      );
    const scopeNote = context.sampled
      ? `Generated from selected excerpts across ${context.pages} pages to fit the AI provider limit. Ask specific questions to explore details.`
      : undefined;
    const savedResult = { ...result, ...(scopeNote ? { scopeNote } : {}) };
    const { data: artifact, error: saveError } = await db
      .from('study_artifacts')
      .insert({ user_id: user.id, document_id: doc.id, kind: body.action, content: savedResult })
      .select('id')
      .single();
    if (saveError) throw saveError;
    if (body.action === 'summary') {
      const { error: updateError } = await db
        .from('documents')
        .update({ summary: 'summary' in result ? result.summary : null })
        .eq('id', doc.id);
      if (updateError) throw updateError;
    }
    return NextResponse.json({ ...savedResult, artifactId: artifact!.id });
  } catch (e) {
    return fail(e);
  }
}
