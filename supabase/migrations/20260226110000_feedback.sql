-- Feedback center tables + storage bucket

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid null references public.teachers(id) on delete set null,
  display_name text not null,
  is_anonymous boolean not null default true,
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'open'
    check (status in ('open', 'replied', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback_replies (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback(id) on delete cascade,
  author_role text not null
    check (author_role in ('user', 'developer')),
  author_name text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_teacher_id
  on public.feedback (teacher_id);
create index if not exists idx_feedback_created_at_desc
  on public.feedback (created_at desc);
create index if not exists idx_feedback_status
  on public.feedback (status);

create index if not exists idx_feedback_replies_feedback_id
  on public.feedback_replies (feedback_id);
create index if not exists idx_feedback_replies_feedback_id_created_at
  on public.feedback_replies (feedback_id, created_at asc);

alter table public.feedback enable row level security;
alter table public.feedback_replies enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback'
      and policyname = 'feedback_select_authenticated'
  ) then
    create policy "feedback_select_authenticated"
      on public.feedback
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback'
      and policyname = 'feedback_insert_authenticated'
  ) then
    create policy "feedback_insert_authenticated"
      on public.feedback
      for insert
      to authenticated
      with check (teacher_id = auth.uid() or teacher_id is null);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback'
      and policyname = 'feedback_update_service_role'
  ) then
    create policy "feedback_update_service_role"
      on public.feedback
      for update
      to public
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback'
      and policyname = 'feedback_service_role_full_access'
  ) then
    create policy "feedback_service_role_full_access"
      on public.feedback
      for all
      to public
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_replies'
      and policyname = 'feedback_replies_select_authenticated'
  ) then
    create policy "feedback_replies_select_authenticated"
      on public.feedback_replies
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_replies'
      and policyname = 'feedback_replies_insert_user_owned'
  ) then
    create policy "feedback_replies_insert_user_owned"
      on public.feedback_replies
      for insert
      to authenticated
      with check (
        author_role = 'user'
        and exists (
          select 1
          from public.feedback f
          where f.id = feedback_id
            and f.teacher_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_replies'
      and policyname = 'feedback_replies_insert_developer_service_role'
  ) then
    create policy "feedback_replies_insert_developer_service_role"
      on public.feedback_replies
      for insert
      to public
      with check (
        author_role = 'developer'
        and auth.role() = 'service_role'
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_replies'
      and policyname = 'feedback_replies_service_role_full_access'
  ) then
    create policy "feedback_replies_service_role_full_access"
      on public.feedback_replies
      for all
      to public
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end
$$;

create or replace function public.update_feedback_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_feedback_updated_at on public.feedback;

create trigger set_feedback_updated_at
  before update on public.feedback
  for each row
  execute function public.update_feedback_updated_at();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'feedback-attachments',
  'feedback-attachments',
  true,
  10485760,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/pdf'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'feedback_attachments_insert_authenticated'
  ) then
    create policy "feedback_attachments_insert_authenticated"
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'feedback-attachments');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'feedback_attachments_select_public'
  ) then
    create policy "feedback_attachments_select_public"
      on storage.objects
      for select
      to public
      using (bucket_id = 'feedback-attachments');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'feedback_attachments_service_role_full_access'
  ) then
    create policy "feedback_attachments_service_role_full_access"
      on storage.objects
      for all
      to public
      using (
        bucket_id = 'feedback-attachments'
        and auth.role() = 'service_role'
      )
      with check (
        bucket_id = 'feedback-attachments'
        and auth.role() = 'service_role'
      );
  end if;
end
$$;
