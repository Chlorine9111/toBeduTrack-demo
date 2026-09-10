-- Support for material/code upsert and cross-system alignment seeding

update public.pbl_materials
set display_code = coalesce(display_code, 'MID-' || substr(id::text, 1, 8))
where display_code is null;

create unique index if not exists idx_pbl_materials_display_code_unique
  on public.pbl_materials(display_code);

create table if not exists public.pbl_cross_system_alignments (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  ap_code text,
  ib_code text,
  cn_code text,
  alignment_degree text not null check (alignment_degree in ('high', 'partial', 'none')),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.pbl_cross_system_alignments enable row level security;

drop policy if exists pbl_cross_system_alignments_select_policy on public.pbl_cross_system_alignments;
create policy pbl_cross_system_alignments_select_policy on public.pbl_cross_system_alignments
for select using (true);
