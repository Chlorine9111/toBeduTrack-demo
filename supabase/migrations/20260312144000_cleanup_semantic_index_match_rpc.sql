set search_path = public, extensions;

drop function if exists public.match_semantic_index_items(
  uuid,
  vector(1536),
  text[],
  integer,
  double precision,
  text,
  text,
  text
);

drop function if exists public.match_semantic_index_items(
  uuid,
  vector(1536),
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  boolean,
  integer,
  double precision,
  text,
  text,
  text
);
