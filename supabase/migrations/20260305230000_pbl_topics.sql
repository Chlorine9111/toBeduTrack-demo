-- PBL fine-grained topics for assistant normalization and retrieval

create table if not exists public.pbl_topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  curriculum_system text check (curriculum_system in ('AP', 'IB', 'CN')),
  subject text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pbl_topics_curriculum_subject
  on public.pbl_topics(curriculum_system, subject);

create index if not exists idx_pbl_topics_name_lower
  on public.pbl_topics((lower(name)));

create table if not exists public.pbl_topic_aliases (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.pbl_topics(id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now(),
  unique (topic_id, alias)
);

create index if not exists idx_pbl_topic_aliases_topic_id
  on public.pbl_topic_aliases(topic_id);

create index if not exists idx_pbl_topic_aliases_alias_lower
  on public.pbl_topic_aliases((lower(alias)));

create table if not exists public.pbl_material_topics (
  material_id uuid not null references public.pbl_materials(id) on delete cascade,
  topic_id uuid not null references public.pbl_topics(id) on delete cascade,
  relevance text not null default 'primary' check (relevance in ('primary', 'supporting')),
  created_at timestamptz not null default now(),
  primary key (material_id, topic_id)
);

create index if not exists idx_pbl_material_topics_topic_id
  on public.pbl_material_topics(topic_id);

create index if not exists idx_pbl_material_topics_material_id
  on public.pbl_material_topics(material_id);

alter table public.pbl_topics enable row level security;
alter table public.pbl_topic_aliases enable row level security;
alter table public.pbl_material_topics enable row level security;

drop policy if exists pbl_topics_select_policy on public.pbl_topics;
create policy pbl_topics_select_policy on public.pbl_topics
for select using (true);

drop policy if exists pbl_topic_aliases_select_policy on public.pbl_topic_aliases;
create policy pbl_topic_aliases_select_policy on public.pbl_topic_aliases
for select using (true);

drop policy if exists pbl_material_topics_public_select on public.pbl_material_topics;
create policy pbl_material_topics_public_select on public.pbl_material_topics
for select using (
  exists (
    select 1
    from public.pbl_materials m
    where m.id = pbl_material_topics.material_id
      and m.visibility = 'public'
  )
);

drop policy if exists pbl_material_topics_private_owner_select on public.pbl_material_topics;
create policy pbl_material_topics_private_owner_select on public.pbl_material_topics
for select using (
  exists (
    select 1
    from public.pbl_materials m
    where m.id = pbl_material_topics.material_id
      and m.visibility = 'private'
      and m.owner_id = auth.uid()
  )
);

drop policy if exists pbl_topics_service_role_all on public.pbl_topics;
create policy pbl_topics_service_role_all on public.pbl_topics
for all to service_role
using (true)
with check (true);

drop policy if exists pbl_topic_aliases_service_role_all on public.pbl_topic_aliases;
create policy pbl_topic_aliases_service_role_all on public.pbl_topic_aliases
for all to service_role
using (true)
with check (true);

drop policy if exists pbl_material_topics_service_role_all on public.pbl_material_topics;
create policy pbl_material_topics_service_role_all on public.pbl_material_topics
for all to service_role
using (true)
with check (true);
