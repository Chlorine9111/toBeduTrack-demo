-- 为 content_assets 添加分类字段
alter table public.content_assets
  add column if not exists category text not null default 'uncategorized'
  check (category in ('instructional','assessment','student_work','reference','uncategorized'));
