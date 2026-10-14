// Optional live smoke test. Sends only a tiny synthetic lesson to AI providers.
// Run: node --env-file=.env.local scripts/verify-providers.mjs
import { z } from 'zod';
import { writeFileSync, mkdirSync } from 'node:fs';
const lesson =
  'Cells are the basic units of life. The nucleus stores DNA. Mitochondria produce ATP through cellular respiration. The plasma membrane regulates transport. Folded mitochondrial membranes increase surface area for ATP production.';
async function post(url, body, headers) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
function pdf() {
  const lines = [
    'Cell Biology - Page 1',
    'Cells are the basic units of life.',
    'The nucleus stores DNA.',
    'Mitochondria produce ATP through cellular respiration.',
    'The plasma membrane regulates transport.',
  ];
  const stream = `BT /F1 12 Tf 50 750 Td ${lines.map((line, i) => `${i ? '0 -22 Td ' : ''}(${line}) Tj`).join('\n')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let text = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, '0') + ' 00000 n ')
    .join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}
const results = [];
async function check(name, fn) {
  try {
    const details = await fn();
    results.push({ name, passed: true, ...details });
    console.log(`${name}: passed`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error.message.startsWith('HTTP') ? error.message : error.name,
    });
    console.log(`${name}: failed (${results.at(-1).error})`);
    process.exitCode = 1;
  }
}
const groqHeaders = { Authorization: `Bearer ${process.env.GROQ_API_KEY}` };
const geminiHeaders = { 'x-goog-api-key': process.env.GEMINI_API_KEY };
await check('Gemini PDF understanding', async () => {
  const data = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'}:generateContent`,
    {
      contents: [
        {
          parts: [
            {
              text: 'Transcribe the attached document. Return JSON {"pages":[{"page":1,"text":"..."}]}. Preserve page numbers.',
            },
            { inlineData: { mimeType: 'application/pdf', data: pdf().toString('base64') } },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2000 },
    },
    geminiHeaders,
  );
  const pages = z
    .object({
      pages: z
        .array(z.object({ page: z.number().int().positive(), text: z.string().min(1) }))
        .min(1),
    })
    .parse(
      JSON.parse(
        data.candidates[0].content.parts
          .filter((p) => !p.thought)
          .map((p) => p.text)
          .join(''),
      ),
    );
  if (!pages.pages.some((p) => p.text.includes('ATP'))) throw new Error('Missing source text');
  return { pages: pages.pages.length };
});
await check('Gemini 768-dimensional embeddings', async () => {
  const model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
  const data = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`,
    {
      model: `models/${model}`,
      content: { parts: [{ text: lesson }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: 768,
    },
    geminiHeaders,
  );
  z.array(z.number()).length(768).parse(data.embedding.values);
  return { dimensions: 768 };
});
const cases = [
  [
    'summary',
    'Return {"summary":"..."}. Summarize the source.',
    z.object({ summary: z.string().min(1) }),
  ],
  [
    'quiz',
    'Return {"questions":[{"question":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}]}. Create 3 questions. Answers are zero-based indices.',
    z.object({
      questions: z
        .array(
          z.object({
            question: z.string().min(1),
            options: z.array(z.string()).length(4),
            answer: z.number().int().min(0).max(3),
            explanation: z.string().min(1),
          }),
        )
        .min(3),
    }),
  ],
  [
    'flashcards',
    'Return {"cards":[{"front":"...","back":"..."}]}. Create 3 flashcards.',
    z.object({
      cards: z.array(z.object({ front: z.string().min(1), back: z.string().min(1) })).min(3),
    }),
  ],
  [
    'grounded chat',
    'Answer: What produces ATP? Use source [1] only. Return {"answer":"... [1]","citations":[1]}.',
    z.object({ answer: z.string().min(1), citations: z.array(z.literal(1)).min(1) }),
  ],
];
for (const [name, instruction, schema] of cases)
  await check(`Groq ${name}`, async () => {
    const data = await post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        temperature: 0.2,
        ...((process.env.GROQ_MODEL || 'openai/gpt-oss-120b').startsWith('openai/gpt-oss-')
          ? { reasoning_effort: 'low' }
          : {}),
        max_completion_tokens: 2500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Use only the source. Return valid JSON. ' + instruction },
          { role: 'user', content: '[1] ' + lesson },
        ],
      },
      groqHeaders,
    );
    schema.parse(JSON.parse(data.choices[0].message.content));
    return {};
  });
mkdirSync('verification', { recursive: true });
writeFileSync(
  'verification/providers.json',
  JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2) + '\n',
);
