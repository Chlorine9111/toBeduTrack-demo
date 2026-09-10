-- Rubric RPC helpers (transactional create/update)

create or replace function public.create_rubric_from_ai(
  p_course_id uuid,
  p_unit_id uuid,
  p_title text,
  p_teacher_prompt text,
  p_dimensions jsonb
) returns uuid
language plpgsql
as $$
declare
  v_rubric_id uuid;
  v_dim jsonb;
  v_index integer := 0;
  v_dim_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  insert into public.rubrics (
    teacher_id,
    course_id,
    unit_id,
    title,
    status,
    teacher_prompt,
    is_ai_generated,
    teacher_modified
  )
  values (
    auth.uid(),
    p_course_id,
    p_unit_id,
    p_title,
    'draft',
    p_teacher_prompt,
    true,
    false
  )
  returning id into v_rubric_id;

  if p_dimensions is not null then
    for v_dim in select * from jsonb_array_elements(p_dimensions)
    loop
      insert into public.rubric_dimensions (
        rubric_id,
        name,
        description,
        weight,
        sort_order
      )
      values (
        v_rubric_id,
        coalesce(v_dim->>'name', ''),
        nullif(v_dim->>'description', ''),
        coalesce((v_dim->>'weight')::numeric, 1),
        v_index
      )
      returning id into v_dim_id;

      insert into public.rubric_levels (
        dimension_id,
        level,
        score,
        description
      )
      values
        (v_dim_id, 'excellent', 4, coalesce(v_dim->'levels'->>'excellent', '')),
        (v_dim_id, 'good', 3, coalesce(v_dim->'levels'->>'good', '')),
        (v_dim_id, 'passing', 2, coalesce(v_dim->'levels'->>'passing', '')),
        (v_dim_id, 'failing', 1, coalesce(v_dim->'levels'->>'failing', ''));

      v_index := v_index + 1;
    end loop;
  end if;

  return v_rubric_id;
end;
$$;

create or replace function public.update_rubric_with_dimensions(
  p_rubric_id uuid,
  p_title text,
  p_status text,
  p_dimensions jsonb
) returns uuid
language plpgsql
as $$
declare
  v_rubric_id uuid;
  v_dim jsonb;
  v_index integer := 0;
  v_dim_id uuid;
begin
  select id into v_rubric_id
  from public.rubrics
  where id = p_rubric_id
    and teacher_id = auth.uid();

  if v_rubric_id is null then
    raise exception 'rubric_not_found';
  end if;

  update public.rubrics
  set
    title = coalesce(p_title, title),
    status = coalesce(p_status, status),
    teacher_modified = true
  where id = p_rubric_id;

  if p_dimensions is not null then
    delete from public.rubric_dimensions
    where rubric_id = p_rubric_id;

    for v_dim in select * from jsonb_array_elements(p_dimensions)
    loop
      insert into public.rubric_dimensions (
        rubric_id,
        name,
        description,
        weight,
        sort_order
      )
      values (
        p_rubric_id,
        coalesce(v_dim->>'name', ''),
        nullif(v_dim->>'description', ''),
        coalesce((v_dim->>'weight')::numeric, 1),
        v_index
      )
      returning id into v_dim_id;

      insert into public.rubric_levels (
        dimension_id,
        level,
        score,
        description
      )
      values
        (v_dim_id, 'excellent', 4, coalesce(v_dim->'levels'->>'excellent', '')),
        (v_dim_id, 'good', 3, coalesce(v_dim->'levels'->>'good', '')),
        (v_dim_id, 'passing', 2, coalesce(v_dim->'levels'->>'passing', '')),
        (v_dim_id, 'failing', 1, coalesce(v_dim->'levels'->>'failing', ''));

      v_index := v_index + 1;
    end loop;
  end if;

  return v_rubric_id;
end;
$$;
