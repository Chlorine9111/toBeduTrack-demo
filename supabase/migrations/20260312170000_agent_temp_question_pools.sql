create table if not exists public.agent_temp_question_pools (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  source_kind text not null default 'pdf_upload'
    check (source_kind in ('pdf_upload', 'manual')),
  label text not null,
  status text not null default 'ready'
    check (status in ('uploading', 'ocr_processing', 'question_extracting', 'ready', 'ready_with_review', 'failed', 'expired')),
  source_file_names text[] not null default '{}',
  source_upload_ids uuid[] not null default '{}',
  question_count integer not null default 0,
  ready_question_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_temp_question_pools_teacher_updated_idx
  on public.agent_temp_question_pools (teacher_id, updated_at desc);

create index if not exists agent_temp_question_pools_conversation_updated_idx
  on public.agent_temp_question_pools (conversation_id, updated_at desc);

create trigger agent_temp_question_pools_set_updated_at
  before update on public.agent_temp_question_pools
  for each row execute function public.set_updated_at();

alter table public.agent_temp_question_pools enable row level security;

create policy "agent_temp_question_pools_manage_own"
  on public.agent_temp_question_pools
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create table if not exists public.agent_temp_question_pool_items (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.agent_temp_question_pools(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  source_upload_id uuid references public.pdf_scan_uploads(id) on delete set null,
  source_file_name text not null,
  sort_order integer not null default 0,
  question_number integer not null,
  source_page_number integer,
  question_type text not null,
  difficulty text,
  confidence numeric not null default 0,
  question_text text not null,
  options jsonb not null default '[]'::jsonb,
  sub_questions jsonb not null default '[]'::jsonb,
  linked_figures jsonb not null default '[]'::jsonb,
  knowledge_point text,
  source_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists agent_temp_question_pool_items_pool_sort_idx
  on public.agent_temp_question_pool_items (pool_id, sort_order);

create index if not exists agent_temp_question_pool_items_pool_question_idx
  on public.agent_temp_question_pool_items (pool_id, question_number);

create index if not exists agent_temp_question_pool_items_teacher_created_idx
  on public.agent_temp_question_pool_items (teacher_id, created_at desc);

create trigger agent_temp_question_pool_items_set_updated_at
  before update on public.agent_temp_question_pool_items
  for each row execute function public.set_updated_at();

alter table public.agent_temp_question_pool_items enable row level security;

create policy "agent_temp_question_pool_items_manage_own"
  on public.agent_temp_question_pool_items
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());
