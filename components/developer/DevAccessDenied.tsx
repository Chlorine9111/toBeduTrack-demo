import Link from "next/link"

export default function DevAccessDenied() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 text-gray-100 shadow-xl">
        <div className="mb-4">
          <h1 className="text-lg font-semibold">反馈后台无访问权限</h1>
          <p className="mt-2 text-sm text-gray-400">
            当前教师账号不在反馈管理员名单中，无法进入 `/developer` 后台。
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-950/70 px-4 py-3 text-xs text-gray-400">
          正式环境建议通过 `auth.app_metadata`、`public.feedback_admins` 或 `FEEDBACK_ADMIN_USER_IDS` 配置反馈管理员。
        </div>
        <div className="mt-5">
          <Link
            href="/main/feedback"
            className="inline-flex h-10 items-center rounded-lg bg-cyan-500 px-4 text-sm font-medium text-gray-950 transition-colors hover:bg-cyan-400"
          >
            返回反馈中心
          </Link>
        </div>
      </div>
    </div>
  )
}
