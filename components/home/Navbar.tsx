"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Menu, X } from "lucide-react";
import { Button } from "@heroui/react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHomeI18n } from "@/lib/home/i18n";
import HomeLanguageToggle from "./HomeLanguageToggle";
import LinkButton from "@/components/shells/LinkButton";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { t } = useHomeI18n();

  const navLinks = [
    { label: t.nav.features, href: "/#features" },
    { label: t.nav.pricing, href: "/pricing" },
    { label: t.nav.about, href: "/about" },
    { label: t.nav.blog, href: "/blog" },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    if (mobileOpen) {
      document.addEventListener("keydown", handleEsc);
      return () => document.removeEventListener("keydown", handleEsc);
    }
  }, [mobileOpen]);

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-white/80 backdrop-blur-xl border-b border-neutral-100"
          : "bg-transparent"
      )}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 h-14">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <span className="inline-flex items-end font-display text-[18px] font-semibold tracking-tight text-neutral-900">
            <svg className="mb-[3px] mr-px inline-block h-[1.15em] w-[1.15em]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"><path d="M20 4 L20 20 L4 20 Z" /></svg>eskmate
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "px-3 py-1.5 text-[13px] rounded-md transition-colors duration-200",
                pathname === link.href
                  ? "text-neutral-900 font-medium"
                  : "text-neutral-500 hover:text-neutral-900"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-3 md:flex">
          <HomeLanguageToggle />
          <Link
            href="/#demo"
            className="link text-[13px] text-neutral-500 transition-colors hover:text-neutral-900"
          >
            {t.nav.tryDemo}
          </Link>
          <LinkButton
            href="/pricing"
            className="rounded-full px-4 py-1.5 text-[13px] font-medium"
          >
            {t.nav.getStarted}
          </LinkButton>
        </div>

        {/* Mobile toggle */}
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          onPress={() => setMobileOpen((prev) => !prev)}
          className="md:hidden"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-neutral-100 bg-white/95 backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col gap-0.5 px-6 py-3">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "rounded-md px-3 py-2 text-[13px] transition-colors",
                    pathname === link.href
                      ? "text-neutral-900 font-medium bg-neutral-50"
                      : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50"
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-2 flex items-center gap-2 border-t border-neutral-100 pt-3">
                <HomeLanguageToggle />
              </div>
              <LinkButton
                href="/pricing"
                onClick={() => setMobileOpen(false)}
                className="mt-2 block rounded-full px-4 py-2 text-center text-[13px] font-medium"
                fullWidth
              >
                {t.nav.getStarted}
              </LinkButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
