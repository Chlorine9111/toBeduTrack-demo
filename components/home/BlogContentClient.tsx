"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Category } from "@/lib/blog/posts";
import { cn } from "@/lib/utils";

const POSTS_PER_PAGE = 4;

const CATEGORY_BADGE_STYLES: Record<Category, string> = {
  all: "",
  philosophy: "bg-default-200 text-default-600",
  analysis: "bg-[rgba(94,106,210,0.12)] text-primary",
  practical: "bg-[rgba(219,237,219,0.6)] text-[#2e7d32]",
};

const CATEGORY_ORDER: Category[] = [
  "all",
  "philosophy",
  "analysis",
  "practical",
];

export type BlogContentClientPost = {
  slug: string;
  title: string;
  excerpt: string;
  coverImage: string;
  category: Category;
  readTime: string;
  date: string;
};

type BlogContentClientProps = {
  posts: BlogContentClientPost[];
  categoryLabels: Record<Category, string>;
  copy: {
    title: string;
    subtitle: string;
    categoriesLabel: string;
    newestFirstLabel: string;
    readTimeLabel: string;
    olderLabel: string;
    newerLabel: string;
  };
};

export default function BlogContentClient({
  posts,
  categoryLabels,
  copy,
}: BlogContentClientProps) {
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredPosts =
    activeCategory === "all"
      ? posts
      : posts.filter((post) => post.category === activeCategory);

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / POSTS_PER_PAGE));
  const pageStart = (currentPage - 1) * POSTS_PER_PAGE;
  const paginatedPosts = filteredPosts.slice(pageStart, pageStart + POSTS_PER_PAGE);

  return (
    <div className="px-6 py-16 md:py-24">
      <div className="mx-auto max-w-5xl">
        <header className="mb-20 max-w-3xl">
          <h1 className="mb-6 text-5xl font-bold leading-[1.1] tracking-tight text-foreground md:text-6xl">
            {copy.title}
          </h1>
          <p className="text-lg leading-relaxed text-default-500 opacity-80">
            {copy.subtitle}
          </p>
        </header>

        <section className="mb-16 flex flex-wrap items-center gap-3 border-b border-default-100 pb-6">
          <span className="mr-4 text-xs font-bold uppercase tracking-widest text-default-400">
            {copy.categoriesLabel}
          </span>
          {CATEGORY_ORDER.map((category) => {
            const active = category === activeCategory;
            return (
              <button
                key={category}
                type="button"
                onClick={() => {
                  setActiveCategory(category);
                  setCurrentPage(1);
                }}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-default-200 text-foreground"
                    : "text-default-500 hover:bg-default-100 hover:text-foreground",
                )}
              >
                {categoryLabels[category]}
              </button>
            );
          })}
          <p className="ml-auto text-sm font-medium text-default-500">
            {copy.newestFirstLabel}
          </p>
        </section>

        <div className="flex flex-col gap-0">
          {paginatedPosts.map((post, index) => (
            <div key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="group flex flex-col gap-6 rounded-2xl px-2 py-8 transition-colors hover:bg-default-100/50 md:flex-row md:items-start md:gap-8"
              >
                <div className="relative h-24 w-24 overflow-hidden rounded-xl bg-foreground md:h-32 md:w-32">
                  <Image
                    src={post.coverImage}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 128px, 96px"
                    className="object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                        CATEGORY_BADGE_STYLES[post.category],
                      )}
                    >
                      {categoryLabels[post.category]}
                    </span>
                    <time className="text-xs font-medium text-default-400">
                      {post.date}
                    </time>
                  </div>
                  <h2 className="mb-3 text-2xl font-semibold leading-tight text-foreground transition-colors group-hover:text-primary">
                    {post.title}
                  </h2>
                  <p className="max-w-2xl text-sm leading-relaxed text-default-500 opacity-80">
                    {post.excerpt}
                  </p>
                </div>

                <div className="shrink-0 text-sm md:text-right">
                  <span className="block text-xs font-medium text-default-300">
                    {copy.readTimeLabel}
                  </span>
                  <span className="mt-2 block font-bold text-foreground">
                    {post.readTime}
                  </span>
                </div>
              </Link>

              {index < paginatedPosts.length - 1 ? (
                <div className="h-px bg-default-100" />
              ) : null}
            </div>
          ))}
        </div>

        {totalPages > 1 ? (
          <nav className="mt-20 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              className="rounded-full px-4 py-2 text-sm font-semibold text-default-500 transition-colors hover:bg-default-100 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            >
              {copy.olderLabel}
            </button>

            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => {
                const active = page === currentPage;
                return (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={cn(
                      "h-9 min-w-9 rounded-full px-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-default-200 text-foreground"
                        : "text-default-500 hover:bg-default-100 hover:text-foreground",
                    )}
                  >
                    {page}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              className="rounded-full px-4 py-2 text-sm font-semibold text-default-500 transition-colors hover:bg-default-100 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            >
              {copy.newerLabel}
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
