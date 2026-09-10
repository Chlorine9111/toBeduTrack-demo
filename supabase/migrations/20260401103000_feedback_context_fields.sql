alter table public.feedback
  add column if not exists category text not null default 'other'
    check (category in ('bug', 'suggestion', 'content', 'account', 'other')),
  add column if not exists source_path text null,
  add column if not exists source_label text null,
  add column if not exists locale text null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_feedback_category
  on public.feedback (category);

create index if not exists idx_feedback_source_path
  on public.feedback (source_path);
