"use client";

import { LogOut } from "lucide-react";
import { Button } from "@heroui/react";
import { buildLoginUrl } from "@/lib/auth/urls";
import { useAppI18n } from "@/lib/app-i18n/provider";

type LogoutButtonProps = {
  variant?: "solid" | "ghost";
  className?: string;
};

export default function LogoutButton(props: LogoutButtonProps) {
  const { isZh } = useAppI18n();

  return (
    <Button
      variant={props.variant === "ghost" ? "secondary" : "primary"}
      onPress={() => {
        window.dispatchEvent(new Event("deskmate-auth-signing-out"));
        window.location.assign(
          buildLoginUrl({ notice: isZh ? "你已退出演示" : "You have left the demo" }),
        );
      }}
      className={props.className}
    >
      <LogOut className="h-4 w-4" />
      {isZh ? "退出演示" : "Exit demo"}
    </Button>
  );
}
