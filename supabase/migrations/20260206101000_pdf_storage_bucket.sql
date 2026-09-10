-- Ensure PDF storage bucket and per-user object policies.

insert into storage.buckets (id, name, public)
values ('pdfs', 'pdfs', false)
on conflict (id) do update
set public = excluded.public;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'pdf_objects_select_own'
  ) then
    create policy "pdf_objects_select_own"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'pdfs'
        and (storage.foldername(name))[1] = concat('user_', auth.uid()::text)
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'pdf_objects_insert_own'
  ) then
    create policy "pdf_objects_insert_own"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'pdfs'
        and (storage.foldername(name))[1] = concat('user_', auth.uid()::text)
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'pdf_objects_update_own'
  ) then
    create policy "pdf_objects_update_own"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'pdfs'
        and (storage.foldername(name))[1] = concat('user_', auth.uid()::text)
      )
      with check (
        bucket_id = 'pdfs'
        and (storage.foldername(name))[1] = concat('user_', auth.uid()::text)
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'pdf_objects_delete_own'
  ) then
    create policy "pdf_objects_delete_own"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'pdfs'
        and (storage.foldername(name))[1] = concat('user_', auth.uid()::text)
      );
  end if;
end
$$;
