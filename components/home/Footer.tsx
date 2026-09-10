"use client";

import { Github, Twitter } from "lucide-react";
import Link from "next/link";
import { Button } from "@heroui/react";
import { useHomeI18n } from "@/lib/home/i18n";

const SOCIALS = [
  { icon: <Twitter className="h-3.5 w-3.5" />, href: "#", label: "Twitter" as const },
  { icon: <Github className="h-3.5 w-3.5" />, href: "#", label: "GitHub" as const },
];

export default function Footer() {
  const { t } = useHomeI18n();

  const footerLinks = {
    [t.footer.product]: [
      { label: t.nav.features, href: "/#features" },
      { label: t.nav.pricing, href: "/pricing" },
      { label: t.nav.about, href: "/#how-it-works" },
      { label: t.nav.tryDemo, href: "/#demo" },
    ],
    [t.footer.resources]: [
      { label: t.nav.blog, href: "/blog" },
      { label: "AP Math", href: "/#subjects" },
      { label: "AP Science", href: "/#subjects" },
      { label: "AP CS", href: "/#subjects" },
    ],
    [t.footer.company]: [
      { label: t.nav.about, href: "/about" },
      { label: t.footer.privacy, href: "/privacy" },
      { label: t.footer.terms, href: "/terms" },
      { label: t.footer.contact, href: "mailto:hello@deskmate.ai" },
    ],
  };

  return (
    <footer className="border-t border-neutral-100 px-6 py-12 md:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-5">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2">
              <span className="inline-flex items-end font-display text-[16px] font-semibold text-neutral-900">
                <svg className="mb-[3px] mr-px inline-block h-[1.15em] w-[1.15em]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"><path d="M20 4 L20 20 L4 20 Z" /></svg>eskmate
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-neutral-400">
              {t.footer.description}
            </p>
            <div className="mt-5 flex gap-2">
              {SOCIALS.map((social) => (
                <a key={social.label} href={social.href} aria-label={social.label}>
                  <Button
                    isIconOnly
                    variant="ghost"
                    size="sm"
                    aria-label={social.label}
                  >
                    {social.icon}
                  </Button>
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([heading, links]) => (
            <div key={heading}>
              <h4 className="text-[11px] font-medium uppercase tracking-[0.15em] text-neutral-400">
                {heading}
              </h4>
              <ul className="mt-3 space-y-2">
                {links.map((link) =>
                  link.href.startsWith("mailto:") ? (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="link text-[13px] text-neutral-500 transition-colors hover:text-neutral-900"
                      >
                        {link.label}
                      </a>
                    </li>
                  ) : (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="link text-[13px] text-neutral-500 transition-colors hover:text-neutral-900"
                      >
                        {link.label}
                      </Link>
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-neutral-100 pt-6 md:flex-row">
          <p className="text-[12px] text-neutral-400">
            &copy; {new Date().getFullYear()} {t.footer.copyright}
          </p>
          <div className="flex gap-6 text-[12px]">
            <Link
              href="/privacy"
              className="link text-neutral-400 transition-colors hover:text-neutral-600"
            >
              {t.footer.privacy}
            </Link>
            <Link
              href="/terms"
              className="link text-neutral-400 transition-colors hover:text-neutral-600"
            >
              {t.footer.terms}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
