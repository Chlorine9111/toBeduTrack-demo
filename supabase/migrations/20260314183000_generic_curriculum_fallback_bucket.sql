insert into public.courses (framework, name, code, description)
values (
  'AP',
  '通用',
  'GENERAL_UNCLASSIFIED',
  '系统级通用课程桶：用于承接暂时无法识别到明确学科/课程的内容，避免因缺少课程标签而无法归档。'
)
on conflict (code) do update
set
  framework = excluded.framework,
  name = excluded.name,
  description = excluded.description;

insert into public.units (course_id, unit_number, title, description)
select
  c.id,
  '',
  '通用单元',
  '系统级通用单元桶：用于承接暂时无法识别到明确单元的内容。'
from public.courses c
left join public.units u
  on u.course_id = c.id
 and u.unit_number = ''
where u.id is null;

update public.units
set
  title = '通用单元',
  description = '系统级通用单元桶：用于承接暂时无法识别到明确单元的内容。'
where unit_number = '';

insert into public.topics (
  unit_id,
  topic_number,
  title,
  learning_objectives,
  essential_knowledge,
  math_practices
)
select
  u.id,
  '',
  '通用知识点',
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::text[]
from public.units u
left join public.topics t
  on t.unit_id = u.id
 and t.topic_number = ''
where t.id is null;

update public.topics
set title = '通用知识点'
where topic_number = '';
