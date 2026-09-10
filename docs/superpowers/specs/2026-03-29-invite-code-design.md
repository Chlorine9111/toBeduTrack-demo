# 注册邀请码门控

## 背景

项目即将小规模上线测试，需要限制注册入口，只允许持有邀请码的教师注册。

## 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 验证环节 | 仅注册时 | 已注册用户无需重复验证 |
| 码管理方式 | 环境变量单一码 | 几十人测试无需数据库管理 |
| 未设置时行为 | 自动隐藏字段 | 未来开放注册只需删环境变量 |

## 环境变量

```
INVITE_CODE=DESKMATE2026
```

- 设置 → 注册必须输入正确邀请码
- 未设置或为空 → 邀请码字段不显示，任何人可注册

## 修改文件清单

### 前端

| 文件 | 改动 |
|------|------|
| `app/auth/register/page.tsx` | Server Component 读取 `!!process.env.INVITE_CODE`，传 `inviteRequired` prop 给表单 |
| `components/auth/RegisterForm.tsx` | 条件渲染邀请码输入框；表单提交时携带 `inviteCode` 字段 |
| `lib/auth/forms.ts` | `registerFormSchema` 新增可选 `inviteCode` 字段 |

### 后端

| 文件 | 改动 |
|------|------|
| `app/auth/register/page.tsx` 内的注册 action | 服务端验证 `inviteCode`，trim + 大小写不敏感比较 |
| `app/auth/callback/route.ts` | Google OAuth 回调时，若 `INVITE_CODE` 已设置，检查用户是否通过邀请码注册（通过 user metadata 标记）；新 OAuth 用户无标记则阻止 |

### 不改动

- 登录流程
- Onboarding 流程
- 数据库（无迁移）
- 已注册用户不受影响

## UI 规格

### 邀请码输入框

- **位置**：注册表单中，"确认密码"下方、"服务条款"上方
- **Label**：「邀请码」/「Invitation code」
- **Placeholder**：「请输入邀请码」/「Enter invitation code」
- **类型**：`text`，非 password（方便用户确认输入）
- **错误信息**：「邀请码无效」/「Invalid invitation code」

### Google OAuth 流程

当 `INVITE_CODE` 已设置时：
1. 注册页显示邀请码输入框
2. 用户先输入邀请码，验证通过后才显示 Google OAuth 按钮（或将邀请码存入 URL state）
3. OAuth 回调中从 state 参数取出邀请码验证
4. 验证失败：删除刚创建的 auth 用户，重定向回注册页并显示错误

## 验证方式

服务端比较逻辑：

```typescript
function verifyInviteCode(input: string): boolean {
  const expected = process.env.INVITE_CODE?.trim();
  if (!expected) return true; // 未设置时放行
  return input.trim().toLowerCase() === expected.toLowerCase();
}
```

## 验证步骤

1. 设置 `INVITE_CODE=TEST123`，启动 dev server
2. 访问注册页，确认邀请码字段出现
3. 输入错误码注册 → 被拒绝，显示错误
4. 输入正确码注册 → 成功进入 onboarding
5. 删除 `INVITE_CODE`，重启 → 邀请码字段消失，可自由注册
6. Google OAuth 注册同样受邀请码约束
