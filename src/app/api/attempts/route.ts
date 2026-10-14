import { z } from 'zod';
import { NextResponse } from 'next/server';
import { authorize, fail, ApiError, readJson, ownedDocument } from '@/lib/api';
import { quizSchema } from '@/lib/core';
export async function POST(request: Request) {
  try {
    const { db, user } = await authorize(request);
    const parsed = z
      .object({
        documentId: z.uuid(),
        artifactId: z.uuid(),
        answers: z.array(z.number().int().min(0).max(3)).min(3).max(10),
      })
      .safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError('Invalid quiz attempt.');
    const body = parsed.data;
    await ownedDocument(db, body.documentId);
    const { data: artifact, error } = await db
      .from('study_artifacts')
      .select('content')
      .eq('id', body.artifactId)
      .eq('document_id', body.documentId)
      .eq('kind', 'quiz')
      .single();
    if (error || !artifact) throw new ApiError('Quiz not found.', 404);
    const { questions } = quizSchema.parse(artifact.content);
    if (questions.length !== body.answers.length) throw new ApiError('Answer every question.');
    const score = questions.filter((q, i) => q.answer === body.answers[i]).length;
    const { error: saveError } = await db
      .from('quiz_attempts')
      .insert({
        user_id: user.id,
        document_id: body.documentId,
        artifact_id: body.artifactId,
        score,
        total: questions.length,
      });
    if (saveError) throw saveError;
    return NextResponse.json({ score, total: questions.length });
  } catch (e) {
    return fail(e);
  }
}
