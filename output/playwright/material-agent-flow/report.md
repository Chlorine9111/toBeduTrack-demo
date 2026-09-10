## UX 验证报告

- 验证级别: L1
- 最终结论: FAIL
- 失败原因: locator.waitFor: Timeout 180000ms exceeded.
Call log:
[2m  - waiting for getByTestId('agent-asset-reference-picker') to be visible[22m

- 关键接口耗时:
  - POST /api/content-assets/upload: 6.35s (200)
  - POST /api/content-assets/status: 1.85s (200)
  - POST /api/content-assets/status: 2.11s (200)
  - POST /api/content-assets/status: 0.44s (200)
  - POST /api/content-assets/status: 0.45s (200)
  - POST /api/content-assets/status: 0.43s (200)
  - POST /api/content-assets/status: 1.16s (200)
  - POST /api/content-assets/status: 0.40s (200)
  - POST /api/content-assets/status: 0.41s (200)
  - POST /api/content-assets/status: 0.41s (200)
  - POST /api/content-assets/status: 0.41s (200)
  - POST /api/content-assets/status: 0.42s (200)
  - POST /api/content-assets/status: 0.38s (200)
  - POST /api/content-assets/status: 0.47s (200)
  - POST /api/content-assets/status: 1.02s (200)
  - POST /api/content-assets/status: 0.42s (200)
  - POST /api/content-assets/status: 0.38s (200)
  - POST /api/content-assets/status: 0.41s (200)
  - POST /api/content-assets/status: 0.43s (200)
  - POST /api/content-assets/status: 0.41s (200)
  - POST /api/content-assets/status: 0.43s (200)
  - POST /api/content-assets/status: 2.39s (200)
- 错误统计:
  - 静态资源 404: 0
  - console error: 0
  - pageerror: 0
- 数据流交叉验证:
  - API 字段 POST /api/content-assets/upload -> asset.assetSource -> DOM/结果 ready: PASS
  - API 字段 GET /api/content-assets/:id -> contentLibraryItem -> DOM/结果 uploaded: PASS
- 产物目录:
  - output/playwright/material-agent-flow
