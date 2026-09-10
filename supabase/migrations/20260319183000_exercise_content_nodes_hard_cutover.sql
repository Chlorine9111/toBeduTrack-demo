alter table public.exercises
  add column if not exists content_json jsonb;

update public.exercises
set content_json = coalesce(
  content_json,
  '{
    "version": 1,
    "type": "FR",
    "stem": [{"id":"placeholder","kind":"text","text":""}],
    "options": null,
    "answer": null,
    "explanation": null,
    "answerSpace": "medium",
    "commonMistakes": []
  }'::jsonb
)
where content_json is null;

alter table public.exercises
  alter column content_json set default '{
    "version": 1,
    "type": "FR",
    "stem": [{"id":"placeholder","kind":"text","text":""}],
    "options": null,
    "answer": null,
    "explanation": null,
    "answerSpace": "medium",
    "commonMistakes": []
  }'::jsonb,
  alter column content_json set not null;

comment on column public.exercises.content_json is
  'Canonical structured exercise content used by OCR ingest, builder drafts, and editable question blocks.';

update public.worksheets
set layout_config = layout_config - 'builderDraft'
where jsonb_typeof(layout_config) = 'object'
  and layout_config ? 'builderDraft';

update public.pdf_scan_uploads
set scan_result = scan_result - 'saveSummary'
where jsonb_typeof(scan_result) = 'object'
  and scan_result ? 'saveSummary';

update public.knowledge_documents
set metadata = metadata - 'questionBank'
where jsonb_typeof(metadata) = 'object'
  and metadata ? 'questionBank';

delete from public.semantic_index_items
where source_kind = 'exercise';

delete from public.semantic_index_items as s
using public.content_library_items as c
where c.content_type = 'question'
  and s.source_kind = 'content_library_item'
  and s.source_id = c.id;

delete from public.content_library_items
where origin_entity_type = 'exercise'
   or content_type = 'question';

delete from public.worksheet_exercises;

delete from public.exercises;

delete from public.exercise_import_batches;
