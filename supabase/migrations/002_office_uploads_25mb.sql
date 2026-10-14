-- Upgrade existing StudyFlow installations. Safe to rerun; preserves user data.
begin;
alter table public.documents drop constraint if exists documents_mime_type_check;
alter table public.documents add constraint documents_mime_type_check check (mime_type in ('application/pdf','text/plain','image/png','image/jpeg','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation'));
alter table public.documents drop constraint if exists documents_size_bytes_check;
alter table public.documents add constraint documents_size_bytes_check check (size_bytes between 1 and 26214400);
update storage.buckets set file_size_limit=26214400,allowed_mime_types=array['application/pdf','text/plain','image/png','image/jpeg','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation'] where id='study-materials';
commit;
