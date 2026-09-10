alter table public.pbl_materials
  add column if not exists curriculum_scope text;

update public.pbl_materials
set curriculum_scope = 'GENERIC'
where curriculum_scope is null;

with material_scope_from_kp as (
  select
    mkp.material_id,
    count(distinct kp.curriculum_system) as scope_count,
    min(kp.curriculum_system) as single_scope
  from public.pbl_material_knowledge_points mkp
  join public.pbl_knowledge_points kp on kp.id = mkp.knowledge_point_id
  group by mkp.material_id
)
update public.pbl_materials m
set curriculum_scope = case
  when scoped.scope_count = 1 then scoped.single_scope
  when scoped.scope_count > 1 then 'GENERIC'
  else m.curriculum_scope
end
from material_scope_from_kp scoped
where m.id = scoped.material_id;

update public.pbl_materials m
set curriculum_scope = case
  when lower(coalesce(m.display_code, '')) like 'apced-%'
    or lower(coalesce(m.title, '') || ' ' || coalesce(m.source, '')) ~ '(^|[^a-z])ap([^a-z]|$)'
    or lower(coalesce(m.source, '')) like '%college board%'
    or lower(coalesce(m.source, '')) like '%ap central%'
  then 'AP'
  when lower(coalesce(m.title, '') || ' ' || coalesce(m.source, '')) like '%international baccalaureate%'
    or lower(coalesce(m.title, '') || ' ' || coalesce(m.source, '')) ~ '(^|[^a-z])ib([^a-z]|$)'
    or lower(coalesce(m.source, '')) like '%ibo%'
    or lower(coalesce(m.source, '')) like '%diploma programme%'
  then 'IB'
  when lower(coalesce(m.title, '') || ' ' || coalesce(m.source, '')) like '%课程标准%'
    or lower(coalesce(m.title, '') || ' ' || coalesce(m.source, '')) like '%教育部%'
    or lower(coalesce(m.title, '') || ' ' || coalesce(m.source, '')) like '%国家中小学%'
    or lower(coalesce(m.title, '') || ' ' || coalesce(m.source, '')) like '%普通高中%'
  then 'CN'
  else 'GENERIC'
end
where not exists (
  select 1
  from public.pbl_material_knowledge_points mkp
  where mkp.material_id = m.id
);

alter table public.pbl_materials
  alter column curriculum_scope set default 'GENERIC';

update public.pbl_materials
set curriculum_scope = 'GENERIC'
where curriculum_scope not in ('AP', 'IB', 'CN', 'GENERIC') or curriculum_scope is null;

alter table public.pbl_materials
  alter column curriculum_scope set not null;

alter table public.pbl_materials
  drop constraint if exists pbl_materials_curriculum_scope_ck;

alter table public.pbl_materials
  add constraint pbl_materials_curriculum_scope_ck
  check (curriculum_scope in ('AP', 'IB', 'CN', 'GENERIC'));

create index if not exists idx_pbl_materials_curriculum_scope
  on public.pbl_materials(curriculum_scope);

comment on column public.pbl_materials.curriculum_scope is
  '素材所属课程体系：AP / IB / CN / GENERIC。GENERIC 表示可跨体系复用的通用素材。';
