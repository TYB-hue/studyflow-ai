import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { readFileSync } from 'node:fs';
const pg = new PGlite({ extensions: { vector } });
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const doc = '33333333-3333-4333-8333-333333333333';
const vectorString = JSON.stringify(Array(768).fill(1 / Math.sqrt(768)));
async function asUser(id: string) {
  await pg.exec(`reset role;set request.jwt.claim.sub='${id}';set role authenticated;`);
}
beforeAll(async () => {
  await pg.exec(`create schema auth;create schema storage;create schema extensions;
 create role anon;create role authenticated;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
 grant usage on schema public,auth,storage,extensions to authenticated,anon;
 grant select,insert,delete on storage.objects to authenticated;`);
  await pg.exec(
    readFileSync(new URL('../supabase/migrations/001_studyflow.sql', import.meta.url), 'utf8'),
  );
  await pg.exec(
    readFileSync(
      new URL('../supabase/migrations/002_office_uploads_25mb.sql', import.meta.url),
      'utf8',
    ),
  );
  await pg.query('insert into auth.users(id) values ($1),($2)', [alice, bob]);
  await asUser(alice);
  await pg.query(
    "insert into public.documents(id,user_id,title,subject,storage_path,mime_type,size_bytes) values($1,$2,'Biology','Biology',$3,'text/plain',20)",
    [doc, alice, `${alice}/${doc}/notes.txt`],
  );
}, 30000);
afterAll(async () => {
  await pg.close();
});
describe('Postgres migration, RLS and RAG', () => {
  it('upgrades storage and document constraints without losing existing data', async () => {
    await pg.exec('reset role');
    const buckets = await pg.query<{ file_size_limit: number; allowed_mime_types: string[] }>(
      'select file_size_limit,allowed_mime_types from storage.buckets',
    );
    expect(Number(buckets.rows[0].file_size_limit)).toBe(26214400);
    expect(buckets.rows[0].allowed_mime_types).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    await asUser(bob);
    const args = [
      bob,
      `${bob}/lesson.docx`,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    await pg.query(
      "insert into public.documents(user_id,title,storage_path,mime_type,size_bytes) values($1,'lesson',$2,$3,26214400)",
      args,
    );
    await expect(
      pg.query(
        "insert into public.documents(user_id,title,storage_path,mime_type,size_bytes) values($1,'too large',$2,$3,26214401)",
        args,
      ),
    ).rejects.toThrow();
    await pg.exec('delete from public.documents');
  });

  it('creates an immutable free profile for new users', async () => {
    await asUser(alice);
    expect((await pg.query<{ plan: string }>('select plan from public.profiles')).rows).toEqual([
      { plan: 'free' },
    ]);
    await expect(pg.exec("update public.profiles set plan='pro'")).rejects.toThrow();
  });
  it('blocks cross-user documents, artifacts and private storage', async () => {
    await asUser(bob);
    expect((await pg.query('select * from public.documents')).rows).toHaveLength(0);
    await expect(
      pg.query(
        "insert into public.documents(user_id,title,storage_path,mime_type,size_bytes) values($1,'stolen',$2,'text/plain',20)",
        [alice, `${alice}/notes.txt`],
      ),
    ).rejects.toThrow();
    await expect(
      pg.query(
        "insert into public.study_artifacts(document_id,user_id,kind,content) values($1,$2,'quiz','{}')",
        [doc, bob],
      ),
    ).rejects.toThrow();
    await asUser(alice);
    await pg.query("insert into storage.objects(bucket_id,name) values('study-materials',$1)", [
      `${alice}/notes.txt`,
    ]);
    await asUser(bob);
    expect((await pg.query('select * from storage.objects')).rows).toHaveLength(0);
  });
  it('atomically stores chunks and retrieves only the owned document', async () => {
    await asUser(alice);
    const rows = [
      {
        chunk_index: 0,
        page: 2,
        content: 'Mitochondria produce ATP.',
        embedding: JSON.parse(vectorString),
      },
    ];
    await pg.query('select public.finish_processing($1,$2::jsonb)', [doc, JSON.stringify(rows)]);
    const matches = await pg.query<{ page: number; similarity: number }>(
      'select * from public.match_chunks($1::extensions.vector,$2,6)',
      [vectorString, doc],
    );
    expect(matches.rows[0].page).toBe(2);
    expect(matches.rows[0].similarity).toBeCloseTo(1);
    await asUser(bob);
    expect(
      (
        await pg.query('select * from public.match_chunks($1::extensions.vector,$2,6)', [
          vectorString,
          doc,
        ])
      ).rows,
    ).toHaveLength(0);
    await expect(
      pg.query('select public.finish_processing($1,$2::jsonb)', [doc, JSON.stringify(rows)]),
    ).rejects.toThrow();
  });
  it('rolls back a failed chunk replacement', async () => {
    await asUser(alice);
    await expect(
      pg.query('select public.finish_processing($1,$2::jsonb)', [
        doc,
        JSON.stringify([{ chunk_index: 0, page: 1, content: 'bad', embedding: [1, 2] }]),
      ]),
    ).rejects.toThrow();
    expect((await pg.query('select content from public.document_chunks')).rows).toEqual([
      { content: 'Mitochondria produce ATP.' },
    ]);
  });
  it('enforces the daily quota in the database', async () => {
    await asUser(alice);
    for (let i = 0; i < 100; i++) {
      expect(
        (await pg.query<{ allowed: boolean }>("select public.consume_quota('ai') as allowed"))
          .rows[0].allowed,
      ).toBe(true);
    }
    expect(
      (await pg.query<{ allowed: boolean }>("select public.consume_quota('ai') as allowed")).rows[0]
        .allowed,
    ).toBe(false);
    await expect(pg.exec('update public.daily_usage set ai_count=0')).rejects.toThrow();
  });
  it('enforces document limits even for direct authenticated inserts', async () => {
    await asUser(alice);
    for (let i = 1; i < 20; i++) {
      await pg.query(
        "insert into public.documents(user_id,title,storage_path,mime_type,size_bytes) values($1,'notes',$2,'text/plain',20)",
        [alice, `${alice}/${i}.txt`],
      );
    }
    await expect(
      pg.query(
        "insert into public.documents(user_id,title,storage_path,mime_type,size_bytes) values($1,'extra',$2,'text/plain',20)",
        [alice, `${alice}/extra.txt`],
      ),
    ).rejects.toThrow('Document limit');
  });
});
