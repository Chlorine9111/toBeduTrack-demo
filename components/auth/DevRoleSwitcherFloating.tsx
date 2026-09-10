"use client";

import { usePathname } from "next/navigation";
import DevRoleSwitcherClient from "@/components/auth/DevRoleSwitcherClient";
import { shouldHideFloatingDevRoleSwitcher } from "@/lib/auth/dev-role-switcher";
import type { AppRole } from "@/lib/auth/roles";

type DevRoleSwitcherFloatingProps = {
  roles: AppRole[];
  activeRole: AppRole | null;
};

export default function DevRoleSwitcherFloating(props: DevRoleSwitcherFloatingProps) {
  const pathname = usePathname();

  if (shouldHideFloatingDevRoleSwitcher(pathname)) {
    return null;
  }

  return <DevRoleSwitcherClient roles={props.roles} activeRole={props.activeRole} />;
}
