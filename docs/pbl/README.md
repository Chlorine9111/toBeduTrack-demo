# PBL Module Bootstrap

## Scope in this branch
- PBL API routes (generate/materials/curriculum/projects/logs)
- Zod schemas aligned with input/output规范
- Generator pipeline (overview -> expand plan -> quality check)
- Data collection scripts for materials and curriculum points (AP-first)
- Supabase migration scaffold for PBL domain tables + RLS

## Run collection scripts
```bash
npm run pbl:collect
```

Generated artifacts:
- `data/pbl/materials.collected.json`（含 `content/originalContent` 长文本与来源链接）
- `data/pbl/knowledgepoints.seed.json`
- `docs/pbl/materials-catalog.md`
- `docs/pbl/knowledgepoints-catalog.md`
- `docs/pbl/materials-content-enrich-report.md`（抓取成功/回退统计）

## Seed to Supabase (public material + knowledge base)
```bash
# 1) apply migrations first
# 2) verify dataset count without writing
npm run pbl:seed:dry

# 3) write into Supabase
npm run pbl:seed
```

## Backfill material ↔ knowledge-point links (after migration)
```bash
# dry run (only compute mapping)
npm run pbl:mkp:dry

# write mapping into pbl_material_knowledge_points
npm run pbl:mkp
```

## PBL smoke generation check
```bash
npm run pbl:smoke
```

Required env:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- (runtime read path) `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- set `ENABLE_PBL_DB=1` to make API prefer DB read/write path

## API quick flow
1. `POST /api/pbl/generate` with `{"action":"overview","input":{...}}`
2. Select option and expand:
   - `POST /api/pbl/generate` with `{"action":"expand","requestId":"...","optionLabel":"A"}`
   - or `POST /api/pbl/projects/{requestId}/select`
3. List plans: `GET /api/pbl/projects`
4. Export Markdown: `GET /api/pbl/projects/{planId}/export?format=md`

## Notes
- Persistence defaults to in-memory mock store.
- Set `ENABLE_PBL_DB=1` after applying migration to enable DB write path.
