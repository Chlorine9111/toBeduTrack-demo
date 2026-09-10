-- 教师智能助手：知识库 + 对话 + 消息基础表

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  filename text not null,
  file_type text not null,
  file_size integer not null default 0,
  subject text,
  unit text,
  tags text[] not null default '{}',
  supermemory_id text,
  storage_path text,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_knowledge_documents_teacher_created
  on public.knowledge_documents(teacher_id, created_at desc);

create index if not exists idx_assistant_conversations_teacher_updated
  on public.assistant_conversations(teacher_id, updated_at desc);

create index if not exists idx_assistant_messages_conversation_created
  on public.assistant_messages(conversation_id, created_at asc);

create index if not exists idx_assistant_messages_teacher_created
  on public.assistant_messages(teacher_id, created_at desc);

create trigger knowledge_documents_set_updated_at
  before update on public.knowledge_documents
  for each row execute function public.set_updated_at();

create trigger assistant_conversations_set_updated_at
  before update on public.assistant_conversations
  for each row execute function public.set_updated_at();

alter table public.knowledge_documents enable row level security;
alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;

create policy "knowledge_documents_manage_own"
  on public.knowledge_documents
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "assistant_conversations_manage_own"
  on public.assistant_conversations
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "assistant_messages_manage_own"
  on public.assistant_messages
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());
