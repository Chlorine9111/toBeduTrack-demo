-- Product Tour 状态存储
alter table public.teachers
  add column if not exists product_tour_state jsonb not null default '{}';

comment on column public.teachers.product_tour_state is '产品引导状态 JSON: {sidebarTourCompletedAt, allToursDisabled, moduleTours}';
