"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Tooltip } from "@heroui/react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useAppI18n } from "@/lib/app-i18n/provider";

export default function WorksheetHeader({
  title,
  description,
  duration,
  onTitleChange,
  onDescriptionChange,
  onDurationChange,
}: {
  title: string;
  description: string;
  duration: number;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onDurationChange: (value: number) => void;
}) {
  const { isZh } = useAppI18n();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="relative">
      {/* 折叠内容区 */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="header-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-8 pt-8 pb-5">
              <input
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                className="w-full bg-transparent text-center text-[34px] font-semibold tracking-[-0.03em] text-[#37352F] outline-none"
                placeholder={isZh ? "试卷标题" : "Worksheet title"}
              />

              <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_168px]">
                <input
                  value={description}
                  onChange={(event) => onDescriptionChange(event.target.value)}
                  className="rounded-xl border border-[rgba(55,53,47,0.08)] bg-[#fafaf8] px-4 py-3 text-sm text-[#37352F] outline-none"
                  placeholder={
                    isZh
                      ? "试卷描述，例如：AP Chemistry Unit 3 quiz"
                      : "Worksheet description, for example: AP Chemistry Unit 3 quiz"
                  }
                />
                <div className="flex items-center rounded-xl border border-[rgba(55,53,47,0.08)] bg-[#fafaf8] px-4 py-3">
                  <input
                    type="number"
                    min={0}
                    max={300}
                    step={5}
                    value={duration}
                    onChange={(event) =>
                      onDurationChange(
                        Math.max(0, Math.min(300, Number(event.target.value) || 0)),
                      )
                    }
                    className="w-full bg-transparent text-sm text-[#37352F] outline-none"
                  />
                  <span className="text-sm text-[#37352F]/55">{isZh ? "分钟" : "minutes"}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 收起时显示标题摘要 */}
      <AnimatePresence mode="wait">
        {collapsed && (
          <motion.div
            key="collapsed-summary"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-8 py-2.5 text-center">
              <span className="text-sm font-medium text-[#37352F]/60">
                {title || (isZh ? "未命名试卷" : "Untitled worksheet")}
                {description ? ` · ${description}` : ""}
                {duration ? ` · ${duration}min` : ""}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 底部居中把手按钮 */}
      <div className="flex justify-center border-t border-[rgba(55,53,47,0.06)]">
        <Tooltip delay={400} closeDelay={0}>
          <button
            type="button"
            aria-label={collapsed ? "Expand header" : "Collapse header"}
            onClick={() => setCollapsed((prev) => !prev)}
            className="group flex items-center gap-1 rounded-b-lg px-5 py-1 text-[#37352F]/30 transition-colors duration-150 hover:bg-[#f5f5f4] hover:text-[#37352F]/60"
          >
            <motion.div
              animate={{ rotate: collapsed ? 180 : 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex items-center"
            >
              <ChevronUp size={14} />
            </motion.div>
          </button>
          <Tooltip.Content>
            <p>{collapsed ? (isZh ? "展开标题栏" : "Expand header") : (isZh ? "收起标题栏" : "Collapse header")}</p>
          </Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}
