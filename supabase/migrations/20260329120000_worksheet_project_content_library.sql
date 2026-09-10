-- worksheet project: 内容库工程文件 + 私有图片附件

alter table public.content_library_items
  drop constraint if exists content_library_items_renderer_type_check;

alter table public.content_library_items
  add constraint content_library_items_renderer_type_check
  check (
    renderer_type in (
      'rubric',
      'lesson_plan_document',
      'lesson_plan_markdown',
      'exercise',
      'pbl_project_plan',
      'worksheet_project',
      'markdown'
    )
  );

alter table public.content_library_items
  drop constraint if exists content_library_items_origin_entity_type_check;

alter table public.content_library_items
  add constraint content_library_items_origin_entity_type_check
  check (
    origin_entity_type in (
      'rubric',
      'lesson_plan',
      'exercise',
      'pbl_project_plan',
      'worksheet_project',
      'assistant_message',
      'content_asset'
    )
  );

insert into storage.buckets (id, name, public, file_size_limit)
values ('worksheet-project-assets', 'worksheet-project-assets', false, 10485760)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'worksheet_project_assets_objects_select_own'
  ) then
    create policy "worksheet_project_assets_objects_select_own"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'worksheet-project-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'worksheet_project_assets_objects_insert_own'
  ) then
    create policy "worksheet_project_assets_objects_insert_own"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'worksheet-project-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'worksheet_project_assets_objects_delete_own'
  ) then
    create policy "worksheet_project_assets_objects_delete_own"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'worksheet-project-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end
$$;
