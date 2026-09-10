-- 将 PBL 时长单位从"周"改为"课时"
-- pbl_generation_requests: duration text → total_periods integer

ALTER TABLE pbl_generation_requests
  ADD COLUMN IF NOT EXISTS total_periods integer;

-- 迁移历史数据：按原有周数映射到近似课时
UPDATE pbl_generation_requests SET total_periods = CASE
  WHEN duration LIKE '%1-2%' THEN 4
  WHEN duration LIKE '%3-4%' THEN 8
  WHEN duration LIKE '%5-8%' THEN 16
  WHEN duration LIKE '%学期%' THEN 32
  ELSE 8
END
WHERE total_periods IS NULL;

ALTER TABLE pbl_generation_requests
  ALTER COLUMN total_periods SET NOT NULL,
  ALTER COLUMN total_periods SET DEFAULT 8;

-- 保留 duration 列暂不删除，后续确认无依赖后再清理
COMMENT ON COLUMN pbl_generation_requests.duration IS 'DEPRECATED: 已迁移到 total_periods，后续版本删除';
COMMENT ON COLUMN pbl_generation_requests.total_periods IS '教师指定的项目总课时数（2-60）';
