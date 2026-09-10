"use client";

import { useMemo } from "react";
import type {
  LessonPlanListSort,
  LessonPlanListStatus,
  LessonPlanStatus,
  PublicLessonPlanSummary,
} from "@/lib/lesson-plan/types";
import { Button, Chip, Drawer, Input, Select, ListBox, Spinner } from "@heroui/react";
import {
  Archive,
  CheckSquare,
  FilePlus2,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";

type BulkAction = "archive" | "restore" | "delete";
type SingleAction = "archive" | "restore" | "delete";

type PlansDrawerProps = {
  open: boolean;
  plans: PublicLessonPlanSummary[];
  lessonPlanId: string | null;
  isLoading: boolean;
  planQuery: string;
  planStatus: LessonPlanListStatus;
  planSort: LessonPlanListSort;
  selectedPlanIds: string[];
  isBulkOperating: boolean;
  onClose: () => void;
  onOpenPlan: (id: string) => void;
  onPlanQueryChange: (value: string) => void;
  onPlanStatusChange: (value: LessonPlanListStatus) => void;
  onPlanSortChange: (value: LessonPlanListSort) => void;
  onTogglePlanSelection: (id: string) => void;
  onToggleSelectAllVisible: () => void;
  onClearSelection: () => void;
  onBulkAction: (action: BulkAction) => void;
  onSingleAction: (id: string, action: SingleAction) => void;
  onNewPlan: () => void;
};

const STATUS_OPTIONS: Array<{ value: LessonPlanListStatus; label: string }> = [
  { value: "active", label: "在用" },
  { value: "draft", label: "草稿" },
  { value: "published", label: "已发布" },
  { value: "archived", label: "已归档" },
  { value: "all", label: "全部" },
];

const SORT_OPTIONS: Array<{ value: LessonPlanListSort; label: string }> = [
  { value: "updated_desc", label: "最近更新" },
  { value: "created_desc", label: "最近创建" },
  { value: "title_asc", label: "标题 A-Z" },
  { value: "title_desc", label: "标题 Z-A" },
];

function StatusBadge({ status }: { status: LessonPlanStatus }) {
  if (status === "published") {
    return <Chip size="sm" color="success">已发布</Chip>;
  }
  if (status === "archived") {
    return <Chip size="sm" color="warning">已归档</Chip>;
  }
  return <Chip size="sm">草稿</Chip>;
}

export default function PlansDrawer({
  open,
  plans,
  lessonPlanId,
  isLoading,
  planQuery,
  planStatus,
  planSort,
  selectedPlanIds,
  isBulkOperating,
  onClose,
  onOpenPlan,
  onPlanQueryChange,
  onPlanStatusChange,
  onPlanSortChange,
  onTogglePlanSelection,
  onToggleSelectAllVisible,
  onClearSelection,
  onBulkAction,
  onSingleAction,
  onNewPlan,
}: PlansDrawerProps) {
  const selectedSet = useMemo(() => new Set(selectedPlanIds), [selectedPlanIds]);
  const visibleSelectedCount = plans.filter((plan) => selectedSet.has(plan.id)).length;
  const allVisibleSelected =
    plans.length > 0 && visibleSelectedCount > 0 && visibleSelectedCount === plans.length;

  return (
    <Drawer isOpen={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Drawer.Backdrop>
        <Drawer.Content placement="right" className="w-[430px]">
          <Drawer.Dialog data-testid="plans-drawer">
            <Drawer.Header className="border-b border-divider px-5 py-4 dark:border-slate-800">
              <Drawer.Heading className="text-sm font-semibold text-foreground dark:text-white">教案列表</Drawer.Heading>
              <p className="mt-1 text-xs text-default-500 dark:text-default-400">无需跳页，直接在工作台管理</p>
            </Drawer.Header>

            <Drawer.Body className="p-0">
              <div className="space-y-2 border-b border-divider p-4 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onPress={onNewPlan}
                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-foreground dark:hover:bg-default-200"
                  >
                    <FilePlus2 className="h-3.5 w-3.5" />
                    新建教案
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={onToggleSelectAllVisible}
                    isDisabled={plans.length === 0}
                    data-testid="plans-drawer-select-all"
                    className="inline-flex items-center gap-1 rounded-md border border-divider px-2 py-1.5 text-xs text-default-500 hover:bg-default-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    {allVisibleSelected ? "取消全选" : "全选"}
                  </Button>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-default-400" />
                  <Input
                    type="text"
                    value={planQuery}
                    onChange={(event) => onPlanQueryChange(event.target.value)}
                    placeholder="搜索标题或内容"
                    className="w-full rounded-md border border-divider bg-white py-1.5 pl-7 pr-2 text-xs text-slate-700 outline-hidden transition-colors focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Select
                    data-testid="plans-drawer-status"
                    value={planStatus}
                    onChange={(value) => onPlanStatusChange(value as LessonPlanListStatus)}
                  >
                    <Select.Trigger className="w-full rounded-md border border-divider bg-white px-2 py-1.5 text-xs text-slate-700 transition-colors focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-blue-500">
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {STATUS_OPTIONS.map((option) => (
                          <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                            {option.label}
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>

                  <Select
                    data-testid="plans-drawer-sort"
                    value={planSort}
                    onChange={(value) => onPlanSortChange(value as LessonPlanListSort)}
                  >
                    <Select.Trigger className="w-full rounded-md border border-divider bg-white px-2 py-1.5 text-xs text-slate-700 transition-colors focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-blue-500">
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {SORT_OPTIONS.map((option) => (
                          <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                            {option.label}
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>

                {selectedPlanIds.length > 0 && (
                  <div className="rounded-md border border-divider bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] text-default-500 dark:text-default-400">
                        已选 {selectedPlanIds.length} 项
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={onClearSelection}
                        className="text-[11px] text-default-500 underline underline-offset-2 hover:text-slate-700 dark:text-default-400 dark:hover:text-slate-200"
                      >
                        清空
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => onBulkAction("archive")}
                        isDisabled={isBulkOperating}
                        data-testid="plans-drawer-bulk-archive"
                        className="flex items-center justify-center gap-1 rounded-md border border-divider px-1.5 py-1 text-[11px] text-default-500 hover:bg-default-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <Archive className="h-3 w-3" />
                        归档
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => onBulkAction("restore")}
                        isDisabled={isBulkOperating}
                        data-testid="plans-drawer-bulk-restore"
                        className="flex items-center justify-center gap-1 rounded-md border border-divider px-1.5 py-1 text-[11px] text-default-500 hover:bg-default-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <RotateCcw className="h-3 w-3" />
                        恢复
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => onBulkAction("delete")}
                        isDisabled={isBulkOperating}
                        data-testid="plans-drawer-bulk-delete"
                        className="flex items-center justify-center gap-1 rounded-md border border-red-200 px-1.5 py-1 text-[11px] text-red-600 hover:bg-red-50 dark:border-red-800/50 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-3 w-3" />
                        删除
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {isLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Spinner size="sm" />
                  </div>
                ) : plans.length === 0 ? (
                  <div className="rounded-md border border-dashed border-divider px-4 py-8 text-center text-xs text-default-400 dark:border-slate-700 dark:text-default-500">
                    当前筛选条件下暂无教案
                  </div>
                ) : (
                  <div className="space-y-1">
                    {plans.map((plan) => {
                      const isCurrent = lessonPlanId === plan.id;
                      const isSelected = selectedSet.has(plan.id);
                      const canArchive = plan.status !== "archived";
                      const canRestore = plan.status === "archived";
                      return (
                        <div
                          key={plan.id}
                          className={`rounded-md border px-2 py-2 transition-colors ${
                            isCurrent
                              ? "border-blue-200 bg-blue-50 dark:border-blue-800/60 dark:bg-blue-900/20"
                              : "border-divider bg-white hover:border-default-300 dark:border-slate-700 dark:bg-slate-900"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => onTogglePlanSelection(plan.id)}
                              className="mt-0.5 h-3.5 w-3.5 rounded border-default-300 text-foreground focus:ring-slate-500 dark:border-slate-600 dark:bg-slate-800"
                            />
                            <Button
                              variant="ghost"
                              onPress={() => onOpenPlan(plan.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                                  {plan.title || "未命名教案"}
                                </span>
                                <StatusBadge status={plan.status} />
                              </div>
                              <p className="mt-1 truncate text-[11px] text-default-500 dark:text-default-400">
                                {plan.subjectLabel}
                              </p>
                            </Button>
                          </div>

                          <div className="mt-2 flex items-center gap-1 pl-6">
                            <Button
                              size="sm"
                              variant="secondary"
                              onPress={() => onOpenPlan(plan.id)}
                              className="rounded border border-divider px-2 py-0.5 text-[11px] text-default-500 hover:bg-default-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              打开
                            </Button>
                            {canArchive && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onPress={() => onSingleAction(plan.id, "archive")}
                                className="rounded border border-divider px-2 py-0.5 text-[11px] text-default-500 hover:bg-default-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                归档
                              </Button>
                            )}
                            {canRestore && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onPress={() => onSingleAction(plan.id, "restore")}
                                className="rounded border border-divider px-2 py-0.5 text-[11px] text-default-500 hover:bg-default-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                恢复
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="secondary"
                              onPress={() => onSingleAction(plan.id, "delete")}
                              className="rounded border border-red-200 px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50 dark:border-red-800/50 dark:text-red-400 dark:hover:bg-red-900/20"
                            >
                              删除
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
