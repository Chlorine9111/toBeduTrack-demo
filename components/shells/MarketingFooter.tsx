"use client";

import Link from "next/link";

const FOOTER_COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Subjects", href: "/#subjects" },
      { label: "Demo", href: "/#demo" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "AP Courses", href: "/#subjects" },
      { label: "Templates", href: "/main/templates" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Pricing", href: "/pricing" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Contact", href: "mailto:hello@deskmate.ai" },
    ],
  },
];

export default function MarketingFooter() {
  return (
    <footer className="border-t border-divider pt-16 pb-8">
      <div className="mx-auto max-w-[1100px] px-6">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div>
            <Link href="/" className="inline-flex items-center gap-2">
              <span className="inline-flex items-end text-[16px] font-semibold text-foreground">
                <svg className="mb-[3px] mr-px inline-block h-[1.15em] w-[1.15em]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"><path d="M20 4 L20 20 L4 20 Z" /></svg>eskmate
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-default-500">
              AI-powered teaching workspace for AP educators. Create rubrics, worksheets, lesson plans, and more.
            </p>
          </div>

          {/* Link columns */}
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.heading}>
              <h4 className="text-sm font-semibold text-foreground">
                {col.heading}
              </h4>
              <ul className="mt-3 flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith("mailto:") ? (
                      <a
                        href={link.href}
                        className="link text-sm text-default-500 transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="link text-sm text-default-500 transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-divider pt-6 md:flex-row">
          <p className="text-[13px] text-default-400">
            &copy; {new Date().getFullYear()} Deskmate
          </p>
          <div className="flex gap-6 text-[13px]">
            <Link href="/privacy" className="link text-default-400 transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="link text-default-400 transition-colors hover:text-foreground">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
