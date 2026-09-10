## UX 验证报告

- 验证级别: L1
- 最终结论: FAIL
- 失败原因: page.evaluate: TypeError: Failed to fetch
    at eval (eval at evaluate (:290:30), <anonymous>:2:30)
    at UtilityScript.evaluate (<anonymous>:292:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
- 关键接口耗时:
  - POST /api/content-assets/upload: 4.59s (200)
  - POST /api/content-assets/status: 0.47s (200)
  - POST /api/content-assets/status: 0.93s (200)
  - POST /api/content-assets/status: 0.43s (200)
  - POST /api/content-assets/status: 0.40s (200)
  - POST /api/content-assets/status: 0.43s (200)
  - POST /api/content-assets/status: 0.56s (200)
  - POST /api/content-assets/status: 0.40s (200)
  - POST /api/content-assets/status: 0.39s (200)
  - POST /api/content-assets/status: 0.46s (200)
  - POST /api/content-assets/status: 0.41s (200)
  - POST /api/content-assets/status: 0.41s (200)
  - POST /api/content-assets/status: 0.48s (200)
  - POST /api/content-assets/status: 0.41s (200)
  - POST /api/content-assets/status: 0.37s (200)
  - POST /api/content-assets/status: 0.40s (200)
  - POST /api/content-assets/status: 0.41s (200)
  - POST /api/content-assets/status: 0.36s (200)
  - POST /api/content-assets/status: 0.39s (200)
  - POST /api/content-assets/status: 0.44s (200)
- 错误统计:
  - 静态资源 404: 0
  - console error: 1
  - pageerror: 0
- 数据流交叉验证:
- 产物目录:
  - output/playwright/content-assets-upload-material-agent-20260326-154715
