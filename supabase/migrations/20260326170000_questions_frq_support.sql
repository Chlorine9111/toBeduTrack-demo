-- Question-bank FRQ support
-- Adds FRQ fields and rewrites search_questions as the forward version for the merged product.

alter table public.questions
  add column if not exists question_type text default 'mcq',
  add column if not exists parts jsonb default null,
  add column if not exists frq_type_description text default null,
  add column if not exists overall_topic_code text default null;

update public.questions
set question_type = 'mcq'
where question_type is null;

alter table public.questions
  drop constraint if exists questions_question_type_check;

alter table public.questions
  add constraint questions_question_type_check
  check (question_type in ('mcq', 'frq'));

create index if not exists idx_questions_question_type
  on public.questions (question_type);

alter table public.questions alter column choices drop not null;
alter table public.questions alter column correct_answer drop not null;
alter table public.questions alter column stem drop not null;
alter table public.questions drop constraint if exists questions_answer_check;

drop function if exists public.search_questions(
  extensions.vector(1536), text, text, int, text, text, text, int
);

drop function if exists public.search_questions(
  extensions.vector(1536), text, text, int, text, text, text, text, int
);

create or replace function public.search_questions(
  query_embedding extensions.vector(1536),
  search_mode text default 'content',
  filter_course text default null,
  filter_unit int default null,
  filter_topic text default null,
  filter_difficulty text default null,
  filter_cognitive_task text default null,
  filter_question_type text default null,
  match_count int default 20
)
returns table (
  id uuid,
  course text,
  unit int,
  topic_code text,
  difficulty text,
  cognitive_task text,
  transfer_distance text,
  stem text,
  choices jsonb,
  correct_answer text,
  explanation text,
  key_concepts text[],
  stimulus_id uuid,
  standalone_usable boolean,
  similarity float,
  stimulus_content_type text,
  stimulus_description text,
  stimulus_image_url text,
  question_type text,
  parts jsonb,
  source_assessment text,
  question_number int
)
language plpgsql
security invoker
as $$
begin
  if search_mode = 'diagnostic' then
    return query
    select
      q.id,
      q.course,
      q.unit,
      q.topic_code,
      q.difficulty,
      q.cognitive_task,
      q.transfer_distance,
      q.stem,
      q.choices,
      q.correct_answer,
      q.explanation,
      q.key_concepts,
      q.stimulus_id,
      q.standalone_usable,
      1 - (q.embedding_diagnostic <=> query_embedding) as similarity,
      s.content_type as stimulus_content_type,
      s.description as stimulus_description,
      s.image_url as stimulus_image_url,
      q.question_type,
      q.parts,
      q.source_assessment,
      q.question_number
    from public.questions q
    left join public.stimuli s on q.stimulus_id = s.id
    where
      (filter_course is null or q.course = filter_course)
      and (filter_unit is null or q.unit = filter_unit)
      and (filter_topic is null or q.topic_code = filter_topic)
      and (filter_difficulty is null or q.difficulty = filter_difficulty)
      and (filter_cognitive_task is null or q.cognitive_task = filter_cognitive_task)
      and (filter_question_type is null or q.question_type = filter_question_type)
    order by q.embedding_diagnostic <=> query_embedding
    limit match_count;
  else
    return query
    select
      q.id,
      q.course,
      q.unit,
      q.topic_code,
      q.difficulty,
      q.cognitive_task,
      q.transfer_distance,
      q.stem,
      q.choices,
      q.correct_answer,
      q.explanation,
      q.key_concepts,
      q.stimulus_id,
      q.standalone_usable,
      1 - (q.embedding_content <=> query_embedding) as similarity,
      s.content_type as stimulus_content_type,
      s.description as stimulus_description,
      s.image_url as stimulus_image_url,
      q.question_type,
      q.parts,
      q.source_assessment,
      q.question_number
    from public.questions q
    left join public.stimuli s on q.stimulus_id = s.id
    where
      (filter_course is null or q.course = filter_course)
      and (filter_unit is null or q.unit = filter_unit)
      and (filter_topic is null or q.topic_code = filter_topic)
      and (filter_difficulty is null or q.difficulty = filter_difficulty)
      and (filter_cognitive_task is null or q.cognitive_task = filter_cognitive_task)
      and (filter_question_type is null or q.question_type = filter_question_type)
    order by q.embedding_content <=> query_embedding
    limit match_count;
  end if;
end;
$$;

drop view if exists public.questions_with_stimuli;

create or replace view public.questions_with_stimuli as
select
  q.*,
  s.content_type as stimulus_content_type,
  s.description as stimulus_description,
  s.image_url as stimulus_image_url
from public.questions q
left join public.stimuli s on q.stimulus_id = s.id;

alter table public.stimuli
  drop constraint if exists stimuli_content_type_check;

alter table public.stimuli
  add constraint stimuli_content_type_check
  check (content_type in (
    'diagram', 'data_table', 'passage', 'image', 'map',
    'bar_and_line_graph', 'bar_chart', 'gantt_chart', 'graph',
    'line_graph', 'table', 'text', 'text_data', 'text_passage',
    'boxplot', 'computer_output', 'data_list', 'dotplot',
    'histogram', 'residual_plot', 'scatterplot', 'data_table_and_boxplot',
    'chemical_equation', 'chemical_equation_and_data_table',
    'chemical_equation_and_graph', 'chemical_equation_and_passage',
    'diagram_and_data_table', 'passage_and_diagram', 'passage_and_graph',
    'code', 'code_snippet',
    'chemical_equation_with_data', 'chemical_equation_with_diagram',
    'chemical_equations_with_data', 'data_table_and_diagram',
    'electrolysis_diagram', 'electrolytic_cell_diagram',
    'electrolytic_cell_diagram_with_data', 'electroplating_diagram',
    'energy_diagram', 'galvanic_cell_diagram', 'galvanic_cell_diagram_with_data',
    'galvanic_cell_table', 'half_reaction_table', 'half_reaction_with_data',
    'particle_diagram', 'particle_diagram_with_equation',
    'structural_formula_with_data',
    'diagram_and_graph', 'graph_choices', 'graph_set',
    'class_description', 'code_description'
  ));
