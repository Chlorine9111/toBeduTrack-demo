-- ============================================
-- Content Asset Edges + source_asset_ids
-- Tracks provenance: which assets were used to generate new content
-- ============================================

-- 1. Add source_asset_ids column to content_assets
ALTER TABLE public.content_assets
  ADD COLUMN IF NOT EXISTS source_asset_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_content_assets_source_asset_ids
  ON public.content_assets USING gin (source_asset_ids);

-- 2. content_asset_edges table
CREATE TABLE IF NOT EXISTS public.content_asset_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_asset_id uuid NOT NULL REFERENCES public.content_assets(id) ON DELETE CASCADE,
  target_asset_id uuid NOT NULL REFERENCES public.content_assets(id) ON DELETE CASCADE,
  edge_type text NOT NULL CHECK (edge_type IN ('generated_from', 'related', 'manual')),
  weight double precision NOT NULL DEFAULT 1.0,
  created_by text NOT NULL DEFAULT 'system' CHECK (created_by IN ('system', 'teacher', 'ai')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_asset_id, target_asset_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_content_asset_edges_source
  ON public.content_asset_edges (source_asset_id);

CREATE INDEX IF NOT EXISTS idx_content_asset_edges_target
  ON public.content_asset_edges (target_asset_id);

CREATE INDEX IF NOT EXISTS idx_content_asset_edges_type
  ON public.content_asset_edges (edge_type);

-- RLS
ALTER TABLE public.content_asset_edges ENABLE ROW LEVEL SECURITY;

-- Read: user can see edges where they own at least one side
CREATE POLICY "content_asset_edges_select"
  ON public.content_asset_edges FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.content_assets
      WHERE id = source_asset_id AND teacher_id = auth.uid()
    )
  );

-- Insert: user can create edges for their own assets
CREATE POLICY "content_asset_edges_insert"
  ON public.content_asset_edges FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.content_assets
      WHERE id = target_asset_id AND teacher_id = auth.uid()
    )
  );

-- Delete: user can remove edges on their own assets
CREATE POLICY "content_asset_edges_delete"
  ON public.content_asset_edges FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.content_assets
      WHERE id = target_asset_id AND teacher_id = auth.uid()
    )
  );
