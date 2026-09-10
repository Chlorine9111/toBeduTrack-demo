"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@heroui/react";
import { getRoleLabel, type AppRole } from "@/lib/auth/roles";

type DevRoleSwitcherClientProps = {
  roles: AppRole[];
  activeRole: AppRole | null;
  mode?: "floating" | "inline";
};

export default function DevRoleSwitcherClient(props: DevRoleSwitcherClientProps) {
  const [errorText, setErrorText] = useState("");
  const [pendingRole, setPendingRole] = useState<AppRole | null>(null);
  const [isPending, startTransition] = useTransition();

  const roleOptions = useMemo(
    () =>
      props.roles.map((role) => ({
        role,
        label: getRoleLabel(role, "zh"),
      })),
    [props.roles],
  );
  const isInline = props.mode === "inline";

  const applyRole = (role: AppRole | null) => {
    startTransition(async () => {
      setErrorText("");
      setPendingRole(role);

      try {
        const response = await fetch("/api/dev/role-override", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ role }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; redirectTo?: string }
          | null;

        if (!response.ok || !payload?.redirectTo) {
          setErrorText(payload?.error ?? "切换身份失败");
          return;
        }

        window.location.assign(payload.redirectTo);
      } catch {
        setErrorText("切换身份失败");
      } finally {
        setPendingRole(null);
      }
    });
  };

  return (
    <div
      className={
        isInline
          ? "w-full rounded-lg border border-[#F1D4C5] bg-white p-4"
          : "fixed bottom-4 right-4 z-50 w-[260px] rounded-lg border border-[#F1D4C5] bg-white/96 p-3 shadow-lg backdrop-blur"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A15C38]">
            Dev Role
          </p>
          <p className="mt-1 text-sm font-medium text-[#37352F]">
            当前：{props.activeRole ? getRoleLabel(props.activeRole, "zh") : "未选择"}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {roleOptions.map((option) => {
          const active = option.role === props.activeRole;
          const loading = isPending && pendingRole === option.role;

          return (
            <Button
              key={option.role}
              type="button"
              size="sm"
              variant={active ? "primary" : "outline"}
              onPress={() => applyRole(option.role)}
              isDisabled={isPending || active}
              className={
                active
                  ? "border-[#FF8A5B] bg-[#FF8A5B] text-white"
                  : "border-[#F1D4C5] text-[#A15C38]"
              }
            >
              {loading ? "切换中..." : option.label}
            </Button>
          );
        })}
      </div>

      {errorText ? (
        <p className="mt-2 text-xs text-[#D84B3A]">{errorText}</p>
      ) : (
        <p className="mt-2 text-xs text-[#8A776A]">
          {isInline ? "当前页面暂未开放正式功能，可先切换到其他测试身份继续查看。" : "仅开发环境显示，用于切换测试身份。"}
        </p>
      )}
    </div>
  );
}
