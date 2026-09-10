"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button, Drawer, Link as HeroLink, Separator } from "@heroui/react";
import { cn } from "@/lib/utils";
import LinkButton from "@/components/shells/LinkButton";

const NAV_LINKS = [
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Blog", href: "/blog" },
];

export default function MarketingNavbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b border-divider bg-white/85 backdrop-blur-xl"
          : "bg-white"
      )}
    >
      <nav className="relative mx-auto flex h-14 max-w-[var(--content-max-marketing)] items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="z-10 inline-flex items-center gap-2">
          <span className="inline-flex items-end text-[18px] font-semibold text-foreground">
            <svg className="mb-[3px] mr-px inline-block h-[1.15em] w-[1.15em]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"><path d="M20 4 L20 20 L4 20 Z" /></svg>eskmate
          </span>
        </Link>

        {/* Desktop nav links — absolute center */}
        <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <HeroLink
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[15px] font-medium transition-colors",
                  active
                    ? "text-foreground"
                    : "text-foreground hover:bg-default-200"
                )}
              >
                {link.label}
              </HeroLink>
            );
          })}
        </div>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-4 lg:flex">
          <HeroLink
            href="/auth/login"
            className="text-[15px] font-medium text-foreground transition-colors hover:text-default-500"
          >
            Sign in
          </HeroLink>
          <LinkButton
            href="/auth/register"
            className="h-9 rounded-lg px-5 text-[15px] font-medium"
          >
            Get started
          </LinkButton>
        </div>

        {/* Mobile hamburger */}
        <Drawer isOpen={mobileOpen} onOpenChange={setMobileOpen}>
          <Button
            isIconOnly
            variant="ghost"
            className="lg:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <Drawer.Backdrop>
            <Drawer.Content placement="right">
              <Drawer.Dialog>
                <Drawer.Header>
                  <Drawer.Heading>Menu</Drawer.Heading>
                </Drawer.Header>
                <Drawer.Body>
                  <div className="flex flex-col gap-1">
                    {NAV_LINKS.map((link) => (
                      <HeroLink
                        key={link.href}
                        href={link.href}
                        onPress={() => setMobileOpen(false)}
                        className="rounded-md px-3 py-2.5 text-[15px] font-medium text-foreground transition-colors hover:bg-default-50"
                      >
                        {link.label}
                      </HeroLink>
                    ))}
                    <Separator className="my-3" />
                    <LinkButton
                      href="/auth/login"
                      variant="outline"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-lg px-4 py-2.5 text-center text-[15px] font-medium"
                      fullWidth
                    >
                      Sign in
                    </LinkButton>
                    <LinkButton
                      href="/auth/register"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-lg px-4 py-2.5 text-center text-[15px] font-medium"
                      fullWidth
                    >
                      Get started
                    </LinkButton>
                  </div>
                </Drawer.Body>
              </Drawer.Dialog>
            </Drawer.Content>
          </Drawer.Backdrop>
        </Drawer>
      </nav>
    </header>
  );
}
