-- 教师内容库：统一索引教师生成内容，支持搜索、备注、来源对话与批量操作

create table if not exists public.content_library_items (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  content_type text not null check (content_type in ('rubric', 'lesson_plan', 'question', 'other')),
  renderer_type text not null check (
    renderer_type in ('rubric', 'lesson_plan_document', 'lesson_plan_markdown', 'exercise', 'markdown')
  ),
  origin_key text not null unique,
  origin_entity_type text not null check (origin_entity_type in ('rubric', 'lesson_plan', 'exercise', 'assistant_message')),
  origin_entity_id uuid,
  source_conversation_id uuid references public.assistant_conversations(id) on delete set null,
  source_message_id uuid references public.assistant_messages(id) on delete set null,
  source_item_id uuid references public.content_library_items(id) on delete set null,
  title text not null,
  custom_title text,
  note text,
  summary_text text,
  search_text text not null default '',
  course_id uuid references public.courses(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  course_label text,
  unit_label text,
  snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_library_items_teacher_updated
  on public.content_library_items(teacher_id, updated_at desc);

create index if not exists idx_content_library_items_teacher_type
  on public.content_library_items(teacher_id, content_type, updated_at desc);

create index if not exists idx_content_library_items_teacher_course_unit
  on public.content_library_items(teacher_id, course_id, unit_id, updated_at desc);

create trigger content_library_items_set_updated_at
  before update on public.content_library_items
  for each row execute function public.set_updated_at();

alter table public.content_library_items enable row level security;

create policy "content_library_items_manage_own"
  on public.content_library_items
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

insert into public.content_library_items (
  teacher_id,
  content_type,
  renderer_type,
  origin_key,
  origin_entity_type,
  origin_entity_id,
  title,
  summary_text,
  search_text,
  course_id,
  unit_id,
  course_label,
  unit_label,
  snapshot,
  metadata,
  created_at,
  updated_at
)
select
  r.teacher_id,
  'rubric',
  'rubric',
  format('rubric:%s', r.id),
  'rubric',
  r.id,
  r.title,
  nullif(trim(coalesce(r.teacher_prompt, '')), ''),
  lower(concat_ws(' ',
    r.title,
    coalesce(r.teacher_prompt, ''),
    co.name,
    co.code,
    case
      when u.id is null then ''
      else concat('Unit ', u.unit_number, ' ', u.title)
    end
  )),
  r.course_id,
  r.unit_id,
  co.name,
  case
    when u.id is null then null
    else concat('Unit ', u.unit_number, ' · ', u.title)
  end,
  jsonb_build_object(
    'kind', 'rubric',
    'rubric', jsonb_build_object(
      'id', r.id,
      'courseId', r.course_id,
      'unitId', r.unit_id,
      'title', r.title,
      'status', r.status,
      'teacherPrompt', r.teacher_prompt,
      'isAiGenerated', r.is_ai_generated,
      'teacherModified', r.teacher_modified,
      'createdAt', r.created_at,
      'updatedAt', r.updated_at,
      'course', jsonb_build_object(
        'id', co.id,
        'name', co.name,
        'code', co.code
      ),
      'unit', case
        when u.id is null then null
        else jsonb_build_object(
          'id', u.id,
          'unitNumber', u.unit_number,
          'title', u.title
        )
      end,
      'dimensions', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'name', d.name,
            'description', coalesce(d.description, ''),
            'weight', d.weight,
            'sortOrder', d.sort_order,
            'levels', (
              select coalesce(jsonb_agg(
                jsonb_build_object(
                  'id', l.id,
                  'dimensionId', d.id,
                  'level', l.level,
                  'score', l.score,
                  'description', l.description
                )
                order by l.score desc
              ), '[]'::jsonb)
              from public.rubric_levels l
              where l.dimension_id = d.id
            )
          )
          order by d.sort_order asc
        ), '[]'::jsonb)
        from public.rubric_dimensions d
        where d.rubric_id = r.id
      )
    )
  ),
  jsonb_build_object(
    'status', r.status,
    'dimensionCount', (
      select count(*)::integer
      from public.rubric_dimensions d
      where d.rubric_id = r.id
    )
  ),
  r.created_at,
  r.updated_at
from public.rubrics r
join public.courses co on co.id = r.course_id
left join public.units u on u.id = r.unit_id
on conflict (origin_key) do nothing;

insert into public.content_library_items (
  teacher_id,
  content_type,
  renderer_type,
  origin_key,
  origin_entity_type,
  origin_entity_id,
  title,
  summary_text,
  search_text,
  course_id,
  unit_id,
  course_label,
  unit_label,
  snapshot,
  metadata,
  created_at,
  updated_at
)
select
  lp.teacher_id,
  'lesson_plan',
  'lesson_plan_document',
  format('lesson-plan:%s', lp.id),
  'lesson_plan',
  lp.id,
  lp.title,
  nullif(trim(coalesce(lp.first_section_summary, '')), ''),
  lower(concat_ws(' ',
    lp.title,
    lp.source_prompt,
    lp.subject_label,
    coalesce(co.name, ''),
    coalesce(co.code, ''),
    case
      when u.id is null then ''
      else concat('Unit ', u.unit_number, ' ', u.title)
    end
  )),
  lp.course_id,
  lp.unit_id,
  coalesce(co.name, lp.subject_label),
  case
    when u.id is null then null
    else concat('Unit ', u.unit_number, ' · ', u.title)
  end,
  jsonb_build_object(
    'kind', 'lesson_plan_document',
    'lessonPlan', jsonb_build_object(
      'id', lp.id,
      'title', lp.title,
      'sourcePrompt', lp.source_prompt,
      'subjectLabel', lp.subject_label,
      'courseId', lp.course_id,
      'unitId', lp.unit_id,
      'topicIds', coalesce(lp.topic_ids, '{}'::uuid[]),
      'learningObjectiveCodes', coalesce(lp.learning_objective_codes, '{}'::text[]),
      'essentialKnowledge', coalesce(lp.essential_knowledge, '[]'::jsonb),
      'preferences', jsonb_build_object(
        'durationMinutes', lp.duration_minutes,
        'studentLevel', lp.student_level,
        'languagePref', lp.language_pref,
        'templateKind', lp.template_kind,
        'quizDensity', lp.quiz_density,
        'explanationDepth', lp.explanation_depth,
        'includeExtension', lp.include_extension,
        'showCedCodes', lp.show_ced_codes,
        'includeTeacherNotes', lp.include_teacher_notes
      ),
      'status', lp.status,
      'publishedSlug', lp.published_slug,
      'publishedAt', lp.published_at,
      'createdAt', lp.created_at,
      'updatedAt', lp.updated_at,
      'sections', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'title', s.title,
            'summary', coalesce(s.summary, ''),
            'durationMinutes', coalesce(s.duration_minutes, 0),
            'sortOrder', s.sort_order,
            'blocks', (
              select coalesce(jsonb_agg(
                jsonb_build_object(
                  'id', b.id,
                  'type', b.block_type,
                  'subtype', b.block_subtype,
                  'sortOrder', b.sort_order,
                  'content', coalesce(b.content, '{}'::jsonb),
                  'cedCodes', coalesce(b.ced_codes, '{}'::text[]),
                  'teacherNote', b.teacher_note
                )
                order by b.sort_order asc
              ), '[]'::jsonb)
              from public.lesson_plan_blocks b
              where b.section_id = s.id
            )
          )
          order by s.sort_order asc
        ), '[]'::jsonb)
        from public.lesson_plan_sections s
        where s.lesson_plan_id = lp.id
      )
    )
  ),
  jsonb_build_object(
    'status', lp.status,
    'sectionCount', (
      select count(*)::integer
      from public.lesson_plan_sections s
      where s.lesson_plan_id = lp.id
    )
  ),
  lp.created_at,
  lp.updated_at
from public.lesson_plans lp
left join public.courses co on co.id = lp.course_id
left join public.units u on u.id = lp.unit_id
on conflict (origin_key) do nothing;

insert into public.content_library_items (
  teacher_id,
  content_type,
  renderer_type,
  origin_key,
  origin_entity_type,
  origin_entity_id,
  title,
  summary_text,
  search_text,
  course_id,
  unit_id,
  course_label,
  unit_label,
  snapshot,
  metadata,
  created_at,
  updated_at
)
select
  e.teacher_id,
  'question',
  'exercise',
  format('exercise:%s', e.id),
  'exercise',
  e.id,
  case
    when length(e.question_text) > 72 then concat(left(e.question_text, 72), '...')
    else e.question_text
  end,
  case
    when length(e.question_text) > 220 then concat(left(e.question_text, 220), '...')
    else e.question_text
  end,
  lower(concat_ws(' ',
    e.question_text,
    e.correct_answer,
    e.solution_steps,
    array_to_string(coalesce(e.common_mistakes, '{}'::text[]), ' '),
    coalesce(co.name, ''),
    coalesce(co.code, ''),
    case
      when u.id is null then ''
      else concat('Unit ', u.unit_number, ' ', u.title)
    end
  )),
  e.course_id,
  e.unit_id,
  co.name,
  case
    when u.id is null then null
    else concat('Unit ', u.unit_number, ' · ', u.title)
  end,
  jsonb_build_object(
    'kind', 'exercise',
    'exercise', jsonb_build_object(
      'id', e.id,
      'teacherId', e.teacher_id,
      'courseId', e.course_id,
      'unitId', e.unit_id,
      'topicId', e.topic_id,
      'rubricId', e.rubric_id,
      'type', e.exercise_type,
      'difficulty', e.difficulty,
      'questionText', e.question_text,
      'options', e.options,
      'correctAnswer', e.correct_answer,
      'solutionSteps', e.solution_steps,
      'commonMistakes', coalesce(e.common_mistakes, '{}'::text[]),
      'verificationStatus', e.verification_status,
      'verificationAttempts', e.verification_attempts,
      'isAiGenerated', e.is_ai_generated,
      'teacherModified', e.teacher_modified,
      'teacherPrompt', e.teacher_prompt,
      'createdAt', e.created_at,
      'updatedAt', e.updated_at
    )
  ),
  jsonb_build_object(
    'type', e.exercise_type,
    'difficulty', e.difficulty,
    'verificationStatus', e.verification_status
  ),
  e.created_at,
  e.updated_at
from public.exercises e
join public.courses co on co.id = e.course_id
left join public.units u on u.id = e.unit_id
on conflict (origin_key) do nothing;
