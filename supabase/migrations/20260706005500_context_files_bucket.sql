-- =============================================================================
-- Phase 5B slice 4: context source file storage.
--
-- Private bucket with account-folder policies copied from the founder-documents
-- pattern: object names must start with the account id, and only members of that
-- account can select/insert/update/delete objects in that folder.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'context-files',
  'context-files',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/markdown',
    'text/plain',
    'text/csv',
    'application/json'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "context_files_storage_select" on storage.objects;
create policy "context_files_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'context-files'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "context_files_storage_insert" on storage.objects;
create policy "context_files_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'context-files'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "context_files_storage_update" on storage.objects;
create policy "context_files_storage_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'context-files'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'context-files'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "context_files_storage_delete" on storage.objects;
create policy "context_files_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'context-files'
    and exists (
      select 1 from public.account_members am
      where am.user_id = auth.uid()
        and am.account_id::text = (storage.foldername(name))[1]
    )
  );
