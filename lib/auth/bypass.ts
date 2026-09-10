let hasWarnedBypassInProd = false;

export function isAuthBypassEnabled(): boolean {
  const e2eRequested =
    process.env.E2E_TEST === "1" ||
    process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "1" ||
    process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true";

  const requested =
    e2eRequested ||
    process.env.AUTH_BYPASS === "true" ||
    process.env.NEXT_PUBLIC_AUTH_BYPASS === "true";

  if (!requested) {
    return false;
  }

  const inProduction = process.env.NODE_ENV === "production";
  const allowInProduction = process.env.AUTH_BYPASS_ALLOW_PRODUCTION === "true";

  if (inProduction && !allowInProduction) {
    if (!hasWarnedBypassInProd) {
      hasWarnedBypassInProd = true;
      console.warn(
        "AUTH_BYPASS 在生产环境默认禁用；如确需开启，请设置 AUTH_BYPASS_ALLOW_PRODUCTION=true。",
      );
    }
    return false;
  }

  return true;
}
