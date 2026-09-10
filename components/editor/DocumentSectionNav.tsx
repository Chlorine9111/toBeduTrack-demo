"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { List } from "lucide-react";
import { cn } from "@/lib/utils";

type SectionItem = {
  id: string;
  title: string;
  level: 2 | 3;
};

type DocumentSectionNavProps = {
  htmlContent: string;
  editorRoot?: HTMLElement | null;
  scrollContainer?: HTMLElement | null;
  className?: string;
};

function slugifyHeading(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-\u4e00-\u9fa5]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function decodeHeadingText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSections(htmlContent: string): SectionItem[] {
  const sections: SectionItem[] = [];
  const headingPattern = /<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi;

  let match: RegExpExecArray | null = null;
  let index = 0;

  while ((match = headingPattern.exec(htmlContent))) {
    const level = match[1] === "3" ? 3 : 2;
    const title = decodeHeadingText(match[2] ?? "");
    if (!title) continue;

    sections.push({
      id: `${slugifyHeading(title) || "section"}-${index}`,
      title,
      level,
    });
    index += 1;
  }

  return sections;
}

function queryHeadingElements(editorRoot: HTMLElement | null) {
  if (!editorRoot) return [];
  return Array.from(editorRoot.querySelectorAll("h2, h3")).filter(
    (element): element is HTMLElement => element instanceof HTMLElement,
  );
}

export default function DocumentSectionNav({
  htmlContent,
  editorRoot,
  scrollContainer,
  className,
}: DocumentSectionNavProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const sections = useMemo(() => extractSections(htmlContent), [htmlContent]);

  const updateActiveIndex = useCallback(() => {
    const resolvedEditorRoot = editorRoot ?? null;
    const resolvedScrollContainer = scrollContainer ?? null;
    const headings = queryHeadingElements(resolvedEditorRoot);
    if (headings.length === 0 || !resolvedScrollContainer) {
      setActiveIndex(0);
      return;
    }

    const scrollTop = resolvedScrollContainer.scrollTop;
    const containerTop = resolvedScrollContainer.getBoundingClientRect().top;
    let nextActive = 0;

    headings.forEach((heading, index) => {
      const top =
        heading.getBoundingClientRect().top - containerTop + scrollTop;
      if (top <= scrollTop + 96) {
        nextActive = index;
      }
    });

    setActiveIndex(nextActive);
  }, [editorRoot, scrollContainer]);

  const scrollToSection = useCallback(
    (index: number) => {
      const resolvedEditorRoot = editorRoot ?? null;
      const resolvedScrollContainer = scrollContainer ?? null;
      const headings = queryHeadingElements(resolvedEditorRoot);
      const target = headings[index];
      if (!target || !resolvedScrollContainer) return;

      const scrollTop = resolvedScrollContainer.scrollTop;
      const containerTop = resolvedScrollContainer.getBoundingClientRect().top;
      const targetTop =
        target.getBoundingClientRect().top - containerTop + scrollTop - 32;

      resolvedScrollContainer.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth",
      });
      setActiveIndex(index);
    },
    [editorRoot, scrollContainer],
  );

  useEffect(() => {
    if (sections.length <= 1) {
      setActiveIndex(0);
      return;
    }

    updateActiveIndex();
  }, [sections, updateActiveIndex]);

  useEffect(() => {
    if (!scrollContainer) return undefined;

    let frameId = 0;
    const handleScroll = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        updateActiveIndex();
      });
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      scrollContainer.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [scrollContainer, updateActiveIndex]);

  if (sections.length <= 1) {
    return null;
  }

  let h2Count = 0;

  return (
    <aside className={cn("w-[220px] shrink-0", className)}>
      <div className="sticky top-4">
        <div className="mb-3 flex items-center gap-2 px-2">
          <List className="h-4 w-4 text-default-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-default-400">
            章节导航
          </span>
        </div>

        <nav className="space-y-0.5">
          {sections.map((section, index) => {
            const isH3 = section.level === 3;
            const isActive = index === activeIndex;
            if (!isH3) h2Count += 1;

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToSection(index)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border-l-2 px-2 py-1.5 text-left transition-colors",
                  isH3 && "pl-6",
                  isActive
                    ? "border-foreground bg-default-200 font-medium text-foreground"
                    : "border-transparent text-default-500 hover:bg-default-100",
                )}
              >
                {isH3 ? (
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      isActive ? "bg-foreground" : "bg-default-300",
                    )}
                  />
                ) : (
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                      isActive
                        ? "bg-foreground text-white"
                        : "bg-default-200 text-default-400",
                    )}
                  >
                    {h2Count}
                  </span>
                )}
                <span className="flex-1 truncate text-xs">{section.title}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
