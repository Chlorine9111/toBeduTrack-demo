"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Chip, Spinner } from "@heroui/react";
import { Search } from "lucide-react";
import { apiPost } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useAppI18n } from "@/lib/app-i18n/provider";
import {
  TEMPLATE_DEFINITIONS,
  type TemplateCategory,
  type TemplateDefinition,
} from "@/lib/templates/definitions";

type TemplateFilterCategory = "all" | TemplateCategory;

const CATEGORIES: { value: TemplateFilterCategory; label: { zh: string; en: string } }[] = [
  { value: "all", label: { zh: "全部", en: "All" } },
  { value: "rubric", label: { zh: "评分标准", en: "Rubric" } },
  { value: "worksheet", label: { zh: "练习", en: "Worksheet" } },
  { value: "lesson-plan", label: { zh: "教案", en: "Lesson Plan" } },
  { value: "exam", label: { zh: "测评", en: "Exam" } },
  { value: "notes", label: { zh: "笔记", en: "Notes" } },
];

function SkeletonPreview({ kind }: { kind: TemplateDefinition["previewKind"] }) {
  if (kind === "rubric") {
    return (
      <div className="flex h-full w-full flex-col gap-4 rounded bg-white p-6 shadow-xs">
        <div className="h-3 w-1/3 rounded bg-default-200" />
        <div className="flex flex-col gap-2">
          <div className="h-2 w-full rounded bg-default-100" />
          <div className="h-2 w-11/12 rounded bg-default-100" />
          <div className="h-2 w-4/5 rounded bg-default-100" />
        </div>
        <div className="mt-auto grid grid-cols-2 gap-4">
          <div className="h-8 rounded border border-dashed border-divider" />
          <div className="h-8 rounded border border-dashed border-divider" />
        </div>
      </div>
    );
  }
  if (kind === "lesson-plan") {
    return (
      <div className="flex h-full w-full flex-col gap-6 rounded bg-white p-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-default-100" />
          <div className="flex flex-1 flex-col gap-1">
            <div className="h-2 w-2/3 rounded bg-default-200" />
            <div className="h-2 w-1/2 rounded bg-default-100" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="h-2 w-full rounded bg-default-100" />
          <div className="h-2 w-full rounded bg-default-100" />
          <div className="h-2 w-3/4 rounded bg-default-100" />
        </div>
      </div>
    );
  }
  if (kind === "exam" || kind === "worksheet") {
    return (
      <div className="flex h-full w-full flex-col gap-4 rounded bg-white p-6 shadow-xs">
        <div className="h-3 w-1/2 rounded bg-default-200" />
        <div className="h-px w-full bg-default-200" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-2 w-2/3 rounded bg-default-200" />
              <div className="h-1.5 w-full rounded bg-default-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full w-full gap-4 overflow-hidden rounded bg-white p-6 shadow-xs">
      <div className="flex w-24 flex-col gap-2 rounded-l bg-default-100 p-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-1 w-full bg-default-200" />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-3 py-4">
        <div className="h-3 w-1/2 bg-default-200" />
        <div className="h-1 w-full bg-default-100" />
        <div className="h-1 w-full bg-default-100" />
        <div className="h-1 w-3/4 bg-default-100" />
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const { isZh } = useAppI18n();
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<TemplateFilterCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const pick = (value: { zh: string; en: string }) => (isZh ? value.zh : value.en);

  const filteredTemplates = TEMPLATE_DEFINITIONS.filter((t) => {
    if (activeCategory !== "all" && t.category !== activeCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        pick(t.title).toLowerCase().includes(q) ||
        pick(t.description).toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.label.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleUseTemplate = async (template: TemplateDefinition) => {
    if (creatingId) return;
    setCreatingId(template.id);
    try {
      const payload = await apiPost<{ document: { id: string } }>(
        "/api/documents",
        {
          title: pick(template.title),
          htmlContent: template.htmlContent,
          documentKind: template.documentKind,
          properties: template.properties,
          metadata: {
            templateId: template.id,
            templateCategory: template.category,
          },
        },
      );

      if (payload.document?.id) {
        router.push(`/main/library/${payload.document.id}`);
      }
    } catch (error) {
      console.error("从模板创建文档失败", error);
    } finally {
      setCreatingId(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-7xl px-12 pb-16 pt-8">
        {/* Header */}
        <div className="mb-12">
          <h2 className="mb-2 text-[2rem] font-bold tracking-tight text-foreground">
            {isZh ? "模板" : "Templates"}
          </h2>
          <p className="text-lg text-default-500">
            {isZh
              ? "用预构建模板加速你的教学工作流。"
              : "Start with a pre-built template to accelerate your editorial workflow."}
          </p>
        </div>

        {/* Filter & Search */}
        <div className="mb-10 flex flex-col gap-6 border-b border-divider pb-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-1 overflow-x-auto">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat.value}
                variant={activeCategory === cat.value ? "secondary" : "ghost"}
                onPress={() => setActiveCategory(cat.value)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm transition-colors",
                  activeCategory === cat.value
                    ? "bg-[#EBECED] font-semibold text-foreground"
                    : "text-default-500 hover:bg-default-100 hover:text-foreground"
                )}
              >
                {pick(cat.label)}
              </Button>
            ))}
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-default-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isZh ? "搜索模板..." : "Search templates..."}
              className="w-full rounded-xl border-none bg-default-100 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-default-400 transition-all focus:bg-white focus:ring-1 focus:ring-[rgba(94,106,210,0.3)]"
            />
          </div>
        </div>

        {/* Template Grid */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <Card
              key={template.id}
              role="button"
              tabIndex={0}
              aria-disabled={creatingId !== null}
              onClick={() => { if (creatingId === null) void handleUseTemplate(template) }}
              className="group overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="aspect-4/3 overflow-hidden bg-default-100 p-8">
                <SkeletonPreview kind={template.previewKind} />
              </div>

              <Card.Content className="flex flex-col gap-3 p-6">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                    {pick(template.title)}
                  </h3>
                  {creatingId === template.id ? (
                    <span className="inline-flex items-center gap-1 text-xs text-primary">
                      <Spinner size="sm" />
                      {isZh ? "创建中" : "Creating"}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm leading-6 text-default-500">
                  {pick(template.description)}
                </p>
                <div className="flex flex-wrap gap-2">
                  {template.tags.map((tag) => (
                    <Chip
                      key={tag.label}
                      size="sm"
                     
                      className="text-[11px] font-medium uppercase tracking-wider"
                      style={{ backgroundColor: tag.bgColor, color: tag.textColor }}
                    >
                      {tag.label}
                    </Chip>
                  ))}
                </div>
              </Card.Content>
            </Card>
          ))}
        </div>

        {filteredTemplates.length === 0 && (
          <div className="py-16 text-center text-sm text-default-400">
            {isZh ? "没有找到匹配的模板" : "No templates match your search"}
          </div>
        )}
      </div>
    </div>
  );
}
