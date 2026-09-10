-- ============================================
-- Flashcard Tables: flashcard_sets + flashcards
-- ============================================

-- 1. flashcard_sets
create table if not exists public.flashcard_sets (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.content_assets(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  title text not null,
  card_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_flashcard_sets_teacher on public.flashcard_sets(teacher_id);
create index idx_flashcard_sets_asset on public.flashcard_sets(asset_id);

create trigger flashcard_sets_set_updated_at
  before update on public.flashcard_sets
  for each row execute function public.set_updated_at();

alter table public.flashcard_sets enable row level security;

create policy "flashcard_sets_manage_own" on public.flashcard_sets
  for all using (teacher_id = auth.uid());

-- 2. flashcards
create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.flashcard_sets(id) on delete cascade,
  front_text text not null,
  front_image_url text,
  back_text text not null,
  back_image_url text,
  sort_order integer not null default 0,
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  created_at timestamptz not null default now()
);

create index idx_flashcards_set on public.flashcards(set_id);

alter table public.flashcards enable row level security;

create policy "flashcards_manage_own" on public.flashcards
  for all using (
    exists (select 1 from public.flashcard_sets s where s.id = set_id and s.teacher_id = auth.uid())
  );

-- 3. Extend ref_entity_type check constraint to include 'flashcard_set'
alter table public.content_assets
  drop constraint if exists content_assets_ref_entity_type_check;

alter table public.content_assets
  add constraint content_assets_ref_entity_type_check
  check (ref_entity_type in (
    'rubric', 'lesson_plan', 'exercise', 'pbl_project_plan', 'content_library_item', 'flashcard_set'
  ));
