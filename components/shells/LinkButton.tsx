"use client";

import NextLink from "next/link";
import type { ComponentPropsWithRef } from "react";
import { buttonVariants } from "@heroui/styles";
import type { ButtonVariants } from "@heroui/styles";
import { cn } from "@/lib/utils";

/**
 * HeroUI v3 Button 不支持 `as` 多态 prop。
 * LinkButton 将 Next.js Link 渲染为按钮样式的锚点，替代 `<Button as={Link} href="...">` 用法。
 */
type LinkButtonProps = Omit<ComponentPropsWithRef<typeof NextLink>, "className"> &
  ButtonVariants & {
    className?: string;
    fullWidth?: boolean;
  };

export default function LinkButton({
  children,
  className,
  fullWidth,
  isIconOnly,
  size,
  variant,
  ...linkProps
}: LinkButtonProps) {
  const styles = buttonVariants({ fullWidth, isIconOnly, size, variant });
  return (
    <NextLink className={cn(styles, className)} {...linkProps}>
      {children}
    </NextLink>
  );
}
