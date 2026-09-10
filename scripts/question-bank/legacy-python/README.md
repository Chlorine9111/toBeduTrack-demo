# Legacy Python Question-Bank Tools

These scripts were retained from `toBeduTrack-jiaohu` as reference and emergency maintenance tools for the old `questions` / `stimuli` schema.

They are **not** part of the formal `exercises`-based question-bank pipeline in `toBeduTrack-jiaohu-tya`.

## Retained

- `audit_quality.py`
  - audit legacy question quality issues
- `dedup_target.py`
  - dry-run / execute duplicate cleanup for legacy `questions`
- `cleanup_stimuli.py`
  - remove orphaned legacy `stimuli` rows and merge duplicate image assets
- `fix_images_v2.py`
  - repair missing legacy stimulus images from source PDFs without external vision APIs
- `fix_stem_image_refs.py`
  - inject missing image markdown into legacy `stem` fields

## Required env vars

- `LEGACY_QB_SUPABASE_URL`
- `LEGACY_QB_SERVICE_ROLE_KEY`

Optional:

- `LEGACY_QB_CB_DIR`
  - local PDF corpus root for `fix_images_v2.py`
- `LEGACY_QB_STORAGE_BUCKET`
  - defaults to `question-assets`
- `LEGACY_QB_LOG_PATH`
  - custom log file path for `dedup_target.py`

Compatibility fallbacks still exist for `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, but the `LEGACY_QB_*` names are preferred to avoid pointing these scripts at the formal product DB by accident.

## Intentionally not migrated

These were reviewed and deliberately excluded because they are one-off ingestion or migration flows, or because the formal repo already has a better replacement:

- extraction / import scripts
  - `extract_*.py`
  - `import_*.py`
  - `qb_import.py`
  - `render_pdfs.py`
- cross-database migration scripts
  - `migrate_to_main.py`
  - `migrate_tiku_to_main.py`
- old embedding writers
  - `generate_embeddings.py`
  - `generate_frq_embeddings.py`
  - `fix_embeddings.py`
  - replacement in formal repo: [backfill-semantic-index.ts](/Users/mac/Documents/project/toBeduTrack-jiaohu-tya/scripts/semantic/backfill-semantic-index.ts)
- taxonomy backfill already has a formal replacement:
  - [backfill-exercise-taxonomy.ts](/Users/mac/Documents/project/toBeduTrack-jiaohu-tya/scripts/question-bank/backfill-exercise-taxonomy.ts)

## Source

Copied from the local snapshot of `toBeduTrack-jiaohu` during the merge branch workflow, then sanitized to remove hard-coded secrets.
