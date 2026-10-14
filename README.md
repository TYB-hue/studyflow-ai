# StudyFlow AI

Production: https://studyflow-ai-ahmeds-projects-f39f06ba.vercel.app

Source: https://github.com/TYB-hue/studyflow-ai (private repository)

A functional Next.js + TypeScript study MVP. Upload your own material, ask grounded questions, generate summaries, take scored quizzes, and study flashcards. The responsive interface includes a searchable subject library and progress dashboard.

## Quick start

Use Node.js **22 LTS or 24 LTS** and npm.

```sh
npm ci
cp .env.example .env.local
# Fill in .env.local (see the table below).
npm run dev
```

Open **http://127.0.0.1:3000**. If Supabase identifiers are missing, the app shows an explicitly labeled sample workspace. You can always access samples at `/dashboard?demo=1`; only the Biology document has interactive sample resources. Sample answers are prewritten and never represent live AI output.

For this workspace, the provided keys have already been added to the ignored `.env.local`. Do not overwrite that file with the example. It is excluded from the source archive.

## Supabase setup (required)

1. Create or use your Supabase project.
2. Open the project's SQL editor and run **the entire** `supabase/migrations/001_studyflow.sql`, then `supabase/migrations/002_office_uploads_25mb.sql`. It creates the tables, pgvector extension, indexes, functions, RLS policies, profile trigger, and private `study-materials` bucket. Run it once on a fresh schema. This migration expects pgvector in `extensions`; if your project already has application tables or pgvector in another schema, review before applying.
3. In **Authentication → URL Configuration**, set the Site URL to `http://127.0.0.1:3000`. Add `http://127.0.0.1:3000/auth/callback` and `http://127.0.0.1:3000/auth/callback?next=/login?mode=update` to allowed redirect URLs. For local development you can allow `http://127.0.0.1:3000/**`. Use exact deployed callback URLs in production.
4. Enable the email provider. Email confirmations are supported through Supabase PKCE callbacks. Configure SMTP for dependable production delivery; Supabase's default email service has delivery and rate restrictions. Use sign-up, confirm the email, then sign in. Password reset and password update are included.
5. Copy the **project URL** and **publishable key** from project settings. A legacy anon key also works. No service-role credential is required by the application.
6. Restart the development server after configuration changes.

The failed migration's `CASE` expression has been corrected and the complete migration executes in the included PostgreSQL/pgvector test engine. If the SQL editor ran the earlier script as a single query, the error rolls back that query; rerun the corrected file. If you deliberately applied individual statements, use a fresh test project or inspect which objects exist rather than dropping data.

## Environment

| Variable                               | Location    | Purpose                                            |
| -------------------------------------- | ----------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Public      | Supabase project URL                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public      | Publishable or legacy anon key; protected by RLS   |
| `GROQ_API_KEY`                         | Server only | Groq chat and study generation                     |
| `GEMINI_API_KEY`                       | Server only | Gemini PDF/image understanding and text embeddings |
| `GROQ_MODEL`                           | Server only | Defaults to `openai/gpt-oss-120b`                  |
| `GEMINI_MODEL`                         | Server only | Defaults to `gemini-3.5-flash-lite`                |
| `GEMINI_EMBEDDING_MODEL`               | Server only | Defaults to `gemini-embedding-001`                 |
| `NEXT_PUBLIC_APP_URL`                  | Public      | Canonical origin for email callbacks               |

The model defaults were selected against the provided accounts' live APIs. The older Llama default was absent from Groq's accessible list, Gemini 2.5 Flash rejected generation for this account, and Gemini 3.8 Flash returned temporary overload. Both providers are configurable without changing code. Switching embedding models requires reprocessing existing documents; the database and requests use **768 dimensions**.

Keep AI credentials in `.env.local` or your hosting provider's secret settings. Never put them in browser code, `NEXT_PUBLIC_` variables, Git, screenshots, or exported bundles.

## Architecture

```text
Browser → Next.js server routes → verified Supabase user + database quota
Upload → authenticated signed upload → browser to private Supabase Storage
       → small server processing request → validate original bytes and size
                                ├─ Supabase private Storage / Postgres (RLS)
Upload → Gemini PDF/image extraction → overlapping text chunks
       → Gemini document embeddings (768, normalized) → pgvector
Question → Gemini query embedding → owned-document cosine retrieval
         → Groq answer + excerpt references
Bounded page excerpts → Groq summary / quiz / flashcards → saved artifacts
Quiz answers → server checks stored quiz → saved attempt → dashboard progress
```

The AI clients and Supabase server client use `server-only`. Request handlers authenticate via `getUser()` rather than trusting client session data. The Next.js proxy refreshes auth cookies; authorization is repeated inside server routes and protected pages. No admin database key bypasses RLS.

Grounded chat searches one selected document and returns expandable source excerpts with page numbers. Low-relevance retrieval returns an insufficient-evidence response. Model output is validated; invalid citations outside the retrieved range are rejected. Generated artifacts cite original page numbers, but AI citations and extraction can still be inaccurate: verify against original material. Chat turns are independent questions and are not persisted as conversation history.

## Included behavior and boundaries

- Email sign-up, sign-in, confirmation callback, sign-out, password reset/update.
- Private PDF, DOCX, PPTX, TXT, PNG, JPEG and WebP uploads, up to **25 MB** and **60,000 extracted characters**. DOCX uses extracted text with logical page 1; PPTX preserves slide numbers. Embedded Office images, diagrams and speaker notes are not extracted. Export those materials to PDF for multimodal understanding. Legacy DOC/PPT formats must be saved as DOCX/PPTX or PDF. Office archives have a 40 MB expanded-content safety limit.
- Byte-signature and extension/MIME checks. Upload bodies and JSON bodies are bounded even without Content-Length.
- Synchronous server processing with visible ready/failed status. Failed files can retry from stored private originals. After an interrupted request, processing can be reclaimed after ten minutes.
- Per-page overlapping chunks, batched embedding concurrency, atomic chunk replacement, document-filtered RAG, and ownership constraints.
- Saved summaries, quizzes, flashcards and quiz attempts. New generation reloads into the study workspace; prior generations remain stored.
- Search and subject filter, empty/error/loading states, responsive sidebar, and keyboard accessible controls.
- Free plan: **20 stored documents, 20 uploads/day, 100 AI actions/day**, resetting at midnight UTC. Failed provider calls consume an action. Atomic quota checks and an insertion trigger guard parallel requests. Retrying processing consumes an AI action.
- Plan architecture: immutable `profiles.plan` (`free`/`pro`). The database defines extensible Pro quotas, but no checkout, subscriptions, or Pro UI is enabled. A future verified billing webhook can update the plan with an admin credential.
- Native Next.js App Router, Tailwind 4, Lucide icons, and shadcn-style Radix/CVA UI components.

## Security and production considerations

Every user table has RLS. Composite foreign keys prevent attaching chunks, artifacts, or attempts to another user's document. Storage paths and policies isolate private originals. Quota tables and plan fields cannot be changed by authenticated users. API mutations require a matching Origin header; scripts calling these endpoints must include the application's origin and a valid session. JSON schemas constrain requests and AI output. Source text is explicitly untrusted in prompts. React renders AI output as text; no raw HTML or markdown execution occurs. Logs omit provider response bodies and secrets.

This MVP uses synchronous processing and database daily limits. Before broad public launch, move extraction to a durable background worker for larger files, add per-minute distributed rate limiting and account abuse controls, and set provider spending caps. Supabase Auth supplies its own auth rate controls. User-owned artifact and attempt write policies protect tenant isolation but do not make this an anti-cheating assessment system.

## Checks

```sh
npm test
npm run typecheck
npm run build
npm audit
```

The tests execute the **actual migration** in an embedded PostgreSQL engine with pgvector and Supabase-style auth/storage stubs. They verify SQL compilation, profile creation, cross-user isolation, private storage policy behavior, retrieval ownership, atomic replacement rollback, quota enforcement, and the document cap. Provider and API tests cover MIME/signature validation, chunk/page boundaries, normalized vector dimensions, unsafe redirects, malformed AI output, CSRF origin rejection, authentication, and bounded bodies. This is not a substitute for testing against your configured Supabase project.

Optional live provider smoke test (sends only a tiny synthetic lesson/PDF, may incur provider usage):

```sh
node --env-file=.env.local scripts/verify-providers.mjs
```

It checks Gemini PDF understanding and 768-dimensional embeddings, plus Groq summary, quiz, flashcard and cited-answer output. Only pass/fail metadata is saved in `verification/providers.json`.

A complete live acceptance check after migration and Auth setup:

1. Create and confirm an account; sign in.
2. Upload a short PDF and wait for Ready.
3. Ask a question present in the source; inspect the returned excerpts and pages.
4. Generate a summary, quiz and flashcards. Answer all quiz questions; inspect explanations and dashboard progress.
5. Refresh the study workspace; saved artifacts should reappear.
6. Sign in as another user and confirm the first user's material is unavailable.
7. Test a failed upload, retry, password reset, and deletion of a disposable test document.

## Deployment

Deploy as a **Node.js Next.js application**, for example on a Node host with long-running request support. Run `npm ci && npm run build`, then `npm start`. Set all environment variables in the host, change `NEXT_PUBLIC_APP_URL` to the HTTPS origin, and configure Supabase callback URLs. Provision request timeouts of at least 300 seconds and a multipart body limit above 25 MB for uploads.

The Vercel deployment uses direct signed uploads to private Supabase Storage, keeping 25 MiB file bytes out of Vercel request bodies. Processing routes download and validate the stored original before AI extraction. Only small authenticated metadata requests pass through Vercel. Larger or slower processing jobs still need a durable worker. `maxDuration` declarations cannot override hosting plan limits. The app requires a server; static export is unsupported.

## Project map

- `src/app/`: pages, auth server actions/callback, API handlers.
- `src/components/`: dashboard, study workspace, auth form, reusable UI.
- `src/lib/`: provider adapters, retrieval schemas, processing, security and data types.
- `supabase/migrations/001_studyflow.sql`: schema, policies, quota/retrieval RPCs.
- `tests/`: unit/provider/security tests and executable PostgreSQL migration tests.
- `scripts/verify-providers.mjs`: optional live AI contract checks.
- `verification/`: recorded non-secret verification metadata.

The project is configured for Vercel production deployment. Production credentials are managed in Vercel; local secrets remain in ignored `.env.local`. Configure the production origin in Supabase Auth before using email confirmation or password reset.

## Upgrade existing installations

Run `supabase/migrations/002_office_uploads_25mb.sql` in the SQL editor to enable Office MIME types and increase the bucket/document cap to 25 MiB. It is safe to rerun and preserves existing documents; do not rerun 001 on an existing schema. The Next.js proxy now accepts 26 MiB multipart bodies. Files above 10 MiB use Gemini's resumable Files API and are deleted after extraction instead of embedding a large base64 payload in the generation request.

On small screens, navigation moves to a labeled bottom bar. The dashboard uses the full screen width, study tabs wrap into a two-column grid, and upload forms fit the available viewport.

## Provider limits and blank PDF pages

Blank/whitespace pages are skipped without renumbering remaining pages. Entirely blank documents return an actionable error. Raw validation diagnostics are not displayed as processing errors.

Groq study generation now requests at most 2,500 output tokens, with low reasoning effort on GPT-OSS models. Large document prompts use balanced excerpts from every original page within a 6,000-character input budget; a coverage note is shown and saved with each generated artifact. This is representative coverage, not a claim to summarize every detail. Chat uses the three most relevant retrieved excerpts. A brief transient provider error is retried once; longer rate-limit windows return a provider-specific wait message and HTTP 429. Per-minute and daily provider limits can still require waiting even when a single request fits.
