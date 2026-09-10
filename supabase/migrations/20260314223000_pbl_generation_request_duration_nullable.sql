-- PBL 生成请求已迁移到 total_periods，旧 duration 列仅作兼容保留。
-- 去掉 duration 的 NOT NULL，避免新写法（只依赖 total_periods）被旧约束阻塞。

ALTER TABLE IF EXISTS public.pbl_generation_requests
  ALTER COLUMN duration DROP NOT NULL;

COMMENT ON COLUMN public.pbl_generation_requests.duration IS
  'DEPRECATED: 兼容旧版周数字段，已不再作为生成请求保存的必填列。';
