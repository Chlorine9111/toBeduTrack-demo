import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Share2, LinkIcon, Clock } from "lucide-react";
import MarketingNavbar from "@/components/shells/MarketingNavbar";
import MarketingFooter from "@/components/shells/MarketingFooter";
import { getPostBySlug, getAllSlugs, getRelatedPosts, type BlogPost } from "@/lib/blog/posts";

type BlogDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: BlogDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug, "en");
  if (!post) return { title: "Post not found — Deskmate Blog" };
  return {
    title: `${post.title} — Deskmate Blog`,
    description: post.excerpt,
  };
}

// ---------------------------------------------------------------------------
// Category badge styles
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  philosophy: "bg-default-200 text-[#3a3a3c]",
  analysis: "bg-primary/15 text-[#93c5fd]",
  practical: "bg-[rgba(219,237,219,0.3)] text-[#86efac]",
};

const CATEGORY_HERO_COLORS: Record<string, string> = {
  philosophy: "bg-default-400 text-white/80",
  analysis: "bg-primary/20 text-[#93c5fd]",
  practical: "bg-[rgba(74,222,128,0.15)] text-[#86efac]",
};

const CATEGORY_LABELS_EN: Record<string, string> = {
  philosophy: "Perspective",
  analysis: "Research & Analysis",
  practical: "Practical Guide",
};

const CATEGORY_LABELS_ZH: Record<string, string> = {
  philosophy: "观点",
  analysis: "研究与分析",
  practical: "实用指南",
};

// ---------------------------------------------------------------------------
// Article body renderer
// ---------------------------------------------------------------------------

function ArticleBody({ post }: { readonly post: BlogPost }) {
  const elements: React.ReactNode[] = [];

  // Lead paragraph
  elements.push(
    <p key="lead" className="text-xl leading-relaxed text-foreground/80">
      {post.lead}
    </p>,
  );

  // Sections with pull quote inserted at the right position
  post.sections.forEach((section, idx) => {
    elements.push(
      <h2 key={`h-${section.id}`} id={section.id} className="mt-16 text-2xl font-bold text-foreground">
        {section.title}
      </h2>,
    );
    section.paragraphs.forEach((p, pIdx) => {
      elements.push(
        <p key={`p-${section.id}-${pIdx}`} className="leading-relaxed text-foreground/80">
          {p}
        </p>,
      );
    });

    // Pull quote after specified section
    if (idx === post.pullQuoteAfter) {
      elements.push(
        <div key="pullquote" className="my-16 relative overflow-hidden rounded-xl bg-default-100 p-12">
          <div className="absolute -right-4 -top-4 select-none text-[120px] leading-none text-foreground opacity-5">
            &ldquo;
          </div>
          <p className="relative z-10 text-2xl font-bold tracking-tight text-foreground">
            &ldquo;{post.pullQuote}&rdquo;
          </p>
        </div>,
      );
    }
  });

  return <>{elements}</>;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function BlogDetailPage({ params }: BlogDetailPageProps) {
  const { slug } = await params;

  // TODO: detect locale from cookie/header
  const locale = "en" as "en" | "zh";
  const post = getPostBySlug(slug, locale);
  if (!post) notFound();

  const related = getRelatedPosts(slug, locale);
  const labels = locale === "zh" ? CATEGORY_LABELS_ZH : CATEGORY_LABELS_EN;
  const categoryLabel = labels[post.category] ?? post.category;

  return (
    <>
      <MarketingNavbar />

      {/* Hero Header */}
      <header className="relative flex h-[716px] min-h-[500px] w-full items-end overflow-hidden bg-foreground">
        <img
          src={post.coverImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-linear-to-t from-foreground via-foreground/60 to-foreground/30" />
        <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-20">
          <div className="max-w-[720px]">
            <div className="mb-6 flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide backdrop-blur-xs ${CATEGORY_HERO_COLORS[post.category] ?? "bg-white/10 text-white/70"}`}
              >
                {categoryLabel}
              </span>
              <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-white/50">
                <Clock className="h-3 w-3" /> {post.readTime} {locale === "zh" ? "" : "read"}
              </span>
            </div>
            <h1 className="mb-8 text-4xl font-bold leading-[1.1] tracking-tight text-white md:text-6xl">
              {post.title}
            </h1>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 text-sm font-semibold text-white">
                {post.author.initials}
              </div>
              <div>
                <p className="font-semibold text-white">{post.author.name}</p>
                <p className="text-sm text-white/50">
                  {post.author.role} · {post.date}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto flex max-w-7xl flex-col gap-16 px-6 py-24 lg:flex-row">
        {/* Left Sidebar */}
        <aside className="hidden w-48 shrink-0 lg:block">
          <div className="sticky top-32 space-y-8">
            <div>
              <h4 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-default-400">
                Share
              </h4>
              <div className="flex flex-col gap-4 text-foreground">
                <button className="flex items-center gap-2 text-sm transition-colors hover:text-primary">
                  <Share2 className="h-4 w-4" /> Twitter
                </button>
                <button className="flex items-center gap-2 text-sm transition-colors hover:text-primary">
                  <LinkIcon className="h-4 w-4" /> Copy Link
                </button>
              </div>
            </div>
            <div>
              <h4 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-default-400">
                Jump to
              </h4>
              <ul className="space-y-3 text-sm text-default-500">
                {post.sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="cursor-pointer hover:text-foreground transition-colors">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        {/* Article Body */}
        <article className="min-w-0 max-w-[720px] flex-1">
          <div className="prose prose-lg max-w-none">
            <ArticleBody post={post} />
          </div>

          {/* Tags */}
          <div className="mt-20 flex flex-wrap gap-3 border-t border-divider pt-10">
            {post.tags.map((tag) => (
              <span
                key={tag.label}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold ${tag.colorClass}`}
              >
                {tag.label}
              </span>
            ))}
          </div>

          {/* Author Card */}
          <div className="mt-16 flex items-center gap-6 rounded-2xl bg-default-100 p-8">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-default-200 text-lg font-bold text-foreground">
              {post.author.initials}
            </div>
            <div>
              <p className="font-semibold text-foreground">{post.author.name}</p>
              <p className="text-sm text-default-500">{post.author.bio}</p>
            </div>
          </div>

          {/* Back to blog */}
          <div className="mt-12">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-sm font-medium text-default-500 transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back to all articles
            </Link>
          </div>
        </article>

        {/* Right Rail — Related Articles */}
        <aside className="hidden w-80 shrink-0 xl:block">
          <div className="sticky top-32">
            <h3 className="mb-8 text-sm font-bold uppercase tracking-widest text-default-400">
              Related Articles
            </h3>
            <div className="space-y-10">
              {related.map((rp) => (
                <Link key={rp.slug} href={`/blog/${rp.slug}`} className="group block">
                  <div className="mb-4 h-32 w-full rounded-lg bg-foreground overflow-hidden grayscale transition-all group-hover:grayscale-0">
                    <img src={rp.coverImage} alt="" className="h-full w-full object-cover" />
                  </div>
                  <h4 className="font-bold text-foreground transition-colors group-hover:text-[#0060ae]">
                    {rp.title}
                  </h4>
                  <p className="mt-2 text-xs text-default-500">
                    {rp.readTime} · {rp.author.name}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {/* Continue Reading — mobile/tablet only */}
      <section className="bg-default-100 px-6 py-24 xl:hidden">
        <div className="mx-auto max-w-7xl">
          <h3 className="mb-12 text-2xl font-bold tracking-tight">Continue Reading</h3>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {related.map((rp) => (
              <Link key={rp.slug} href={`/blog/${rp.slug}`} className="block">
                <div className="cursor-pointer rounded-xl bg-white p-6 shadow-xs transition-shadow hover:shadow-md">
                  <div className="mb-6 h-48 w-full rounded-lg bg-foreground overflow-hidden">
                    <img src={rp.coverImage} alt="" className="h-full w-full object-cover" />
                  </div>
                  <h4 className="mb-3 text-xl font-bold">{rp.title}</h4>
                  <p className="mb-6 text-sm text-default-500">{rp.excerpt}</p>
                  <span className="text-sm font-semibold text-[#0060ae]">Read Article &rarr;</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
