-- Run once in the Supabase SQL editor or with supabase db push.
create extension if not exists vector with schema extensions;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 plan text not null default 'free' check (plan in ('free','pro')),
 created_at timestamptz not null default now()
);
create table public.documents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (char_length(title) between 1 and 180),
 subject text not null default 'General' check (char_length(subject) between 1 and 80),
 storage_path text not null,
 mime_type text not null check (mime_type in ('application/pdf','text/plain','image/png','image/jpeg','image/webp')),
 size_bytes int not null check (size_bytes between 1 and 8388608),
 status text not null default 'processing' check (status in ('processing','ready','failed')),
 summary text,
 error text,
 created_at timestamptz not null default now(),
 processing_started_at timestamptz not null default now(),
 unique(id,user_id)
);
create table public.document_chunks (
 id bigint generated always as identity primary key,
 document_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 chunk_index int not null,
 page int not null check (page>0),
 content text not null check (char_length(content) between 1 and 2000),
 embedding extensions.vector(768) not null,
 foreign key(document_id,user_id) references public.documents(id,user_id) on delete cascade,
 unique(document_id,chunk_index)
);
create table public.study_artifacts (
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('summary','quiz','flashcards')),
 content jsonb not null,
 created_at timestamptz not null default now(),
 foreign key(document_id,user_id) references public.documents(id,user_id) on delete cascade,
 unique(id,document_id,user_id)
);
create table public.quiz_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 document_id uuid not null,
 artifact_id uuid not null,
 score int not null,
 total int not null check (total between 3 and 10),
 created_at timestamptz not null default now(),
 check(score between 0 and total),
 foreign key(document_id,user_id) references public.documents(id,user_id) on delete cascade,
 foreign key(artifact_id,document_id,user_id) references public.study_artifacts(id,document_id,user_id) on delete cascade
);
create table public.daily_usage (
 user_id uuid not null references auth.users(id) on delete cascade,
 usage_date date not null default (now() at time zone 'utc')::date,
 ai_count int not null default 0,
 upload_count int not null default 0,
 primary key(user_id,usage_date)
);
alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.study_artifacts enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.daily_usage enable row level security;
create policy own_profile on public.profiles for select to authenticated using(id=auth.uid());
create policy own_documents on public.documents for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and split_part(storage_path,'/',1)=auth.uid()::text);
create policy own_chunks on public.document_chunks for select to authenticated using(user_id=auth.uid());
create policy own_artifacts on public.study_artifacts for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy own_attempts on public.quiz_attempts for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy own_usage on public.daily_usage for select to authenticated using(user_id=auth.uid());
create index documents_owner on public.documents(user_id,created_at desc);
create index chunks_document on public.document_chunks(document_id);
create index artifacts_document on public.study_artifacts(document_id,created_at desc);
create index attempts_owner on public.quiz_attempts(user_id);
create index chunks_vector on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);
-- Plans cannot be updated by users. A future billing webhook can change profiles.plan.
create function public.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id) values(new.id);return new;end;$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.create_profile();
insert into public.profiles(id) select id from auth.users on conflict do nothing;
-- Serialize per-user inserts so parallel uploads cannot exceed the plan limit.
create function public.enforce_document_limit() returns trigger language plpgsql security definer set search_path='' as $$
declare tier text;doc_count int;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
 select plan into tier from public.profiles where id=new.user_id;
 select count(*) into doc_count from public.documents where user_id=new.user_id;
 if doc_count >= (case when tier='pro' then 200 else 20 end) then raise exception 'Document limit reached';end if;
 return new;
end;$$;
create trigger document_limit before insert on public.documents for each row execute procedure public.enforce_document_limit();
create function public.consume_quota(kind text) returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();tier text;usage public.daily_usage;today date:=(now() at time zone 'utc')::date;cap int;
begin
 if uid is null or kind not in ('ai','upload') then raise exception 'Unauthorized quota request';end if;
 insert into public.daily_usage(user_id,usage_date) values(uid,today) on conflict do nothing;
 select * into usage from public.daily_usage where user_id=uid and usage_date=today for update;
 select plan into tier from public.profiles where id=uid;
 if kind='ai' then
 cap:=case when tier='pro' then 1000 else 100 end;
 if usage.ai_count>=cap then return false;end if;
 update public.daily_usage set ai_count=ai_count+1 where user_id=uid and usage_date=today;
 else
 cap:=case when tier='pro' then 200 else 20 end;
 if usage.upload_count>=cap or (select count(*) from public.documents where user_id=uid)>=cap then return false;end if;
 update public.daily_usage set upload_count=upload_count+1 where user_id=uid and usage_date=today;
 end if;
 return true;
end;$$;
-- Atomic chunk replacement prevents partial retrieval after an embedding failure.
create function public.finish_processing(doc_id uuid,rows jsonb) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null or not exists(select 1 from public.documents where id=doc_id and user_id=uid) then raise exception 'Not found';end if;
 if jsonb_array_length(rows) not between 1 and 128 then raise exception 'Invalid chunk count';end if;
 delete from public.document_chunks where document_id=doc_id and user_id=uid;
 insert into public.document_chunks(document_id,user_id,chunk_index,page,content,embedding)
 select doc_id,uid,(r->>'chunk_index')::int,(r->>'page')::int,r->>'content',(r->'embedding')::text::extensions.vector
 from jsonb_array_elements(rows) r;
 update public.documents set status='ready',error=null where id=doc_id and user_id=uid;
end;$$;
create function public.match_chunks(query_embedding extensions.vector(768),filter_document uuid,match_count int default 6)
returns table(content text,page int,similarity double precision) language sql stable security invoker set search_path='' as $$
 select c.content,c.page,1-(c.embedding operator(extensions.<=>) query_embedding) as similarity
 from public.document_chunks c
 where c.user_id=auth.uid() and c.document_id=filter_document
 order by c.embedding operator(extensions.<=>) query_embedding limit least(greatest(match_count,1),6);
$$;
revoke all on function public.consume_quota(text),public.finish_processing(uuid,jsonb),public.match_chunks(extensions.vector,uuid,int) from public,anon;
grant execute on function public.consume_quota(text),public.finish_processing(uuid,jsonb),public.match_chunks(extensions.vector,uuid,int) to authenticated;
revoke all on function public.create_profile(),public.enforce_document_limit() from public,anon,authenticated;
revoke all on public.profiles,public.daily_usage,public.document_chunks from anon,authenticated;
grant select on public.profiles,public.daily_usage,public.document_chunks to authenticated;
grant select,insert,update,delete on public.documents,public.study_artifacts,public.quiz_attempts to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('study-materials','study-materials',false,8388608,array['application/pdf','text/plain','image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
create policy private_materials_read on storage.objects for select to authenticated using(bucket_id='study-materials' and (storage.foldername(name))[1]=auth.uid()::text);
create policy private_materials_insert on storage.objects for insert to authenticated with check(bucket_id='study-materials' and (storage.foldername(name))[1]=auth.uid()::text);
create policy private_materials_delete on storage.objects for delete to authenticated using(bucket_id='study-materials' and (storage.foldername(name))[1]=auth.uid()::text);

-- Recover from a server timeout without starting duplicate processing jobs.
create function public.claim_processing(doc_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.documents set status='processing',error=null,processing_started_at=now()
 where id=doc_id and user_id=auth.uid() and
 (status='failed' or (status='processing' and processing_started_at<now()-interval '10 minutes'));
 return found;
end;$$;
revoke all on function public.claim_processing(uuid) from public,anon;
grant execute on function public.claim_processing(uuid) to authenticated;
