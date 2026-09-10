import { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { PblPlan, PblQualityCheckItem, PblStage, PblStageType } from "@/lib/pbl/types";
import { RubricTable } from "@/components/pbl/RubricTable";
import { EditableText } from "@/components/pbl/EditableText";
import { EditableList } from "@/components/pbl/EditableList";

const DIFFICULTY_LABELS: Record<PblPlan["difficulty"], string> = {
  basic: "基础",
  advanced: "进阶",
  challenge: "挑战",
};

const STAGE_TYPE_LABELS: Record<PblStageType, string> = {
  explore: "探究",
  execute: "执行",
  synthesize: "综合",
};

const QUALITY_STATUS_LABELS: Record<PblQualityCheckItem["status"], string> = {
  pass: "通过",
  warning: "关注",
  fail: "风险",
};

const QUALITY_STATUS_STYLES: Record<PblQualityCheckItem["status"], string> = {
  pass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  fail: "border-rose-200 bg-rose-50 text-rose-700",
};

const REFERENCE_TYPE_LABELS: Record<PblPlan["materialReferences"][number]["referenceType"], string> = {
  driving_question: "驱动问题",
  stage_design: "阶段设计",
  theme_direction: "主题方向",
  outcome_format: "成果形式",
  background_info: "背景资料",
};

type ProjectPlanViewProps = {
  plan: PblPlan;
  editable?: boolean;
  onPlanChange?: (plan: PblPlan) => void;
  showStudentVersion?: boolean;
};

type SectionCardProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <section className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white shadow-xs">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-semibold text-[#1D1D1F]">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[#6B6F76]">{description}</p> : null}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#F7F7F7] px-4 py-3">
      <p className="text-xs uppercase tracking-[0.16em] text-[#6B6F76]">{label}</p>
      <p className="mt-2 text-base font-semibold leading-7 text-[#1D1D1F]">{value}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatQualityKey(key: string) {
  return key
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function renderBulletList(items: string[]) {
  return (
    <ul className="space-y-2 text-sm leading-6 text-slate-700">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function getImplementationLabel(stageType: PblStageType) {
  if (stageType === "explore") return "问题界定步骤";
  if (stageType === "execute") return "实施推进步骤";
  return "整合表达步骤";
}

type StageCardProps = {
  stage: PblStage;
  editable?: boolean;
  onFieldSave?: (field: string, value: string | string[]) => void;
};

function StageCard({ stage, editable, onFieldSave }: StageCardProps) {
  return (
    <article className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#F7F7F7]/70 p-5">
      <div className="flex flex-col gap-3 border-b border-[rgba(0,0,0,0.06)] pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white">
              阶段 {stage.stageNumber}
            </span>
            <span className="rounded-full border border-[rgba(0,0,0,0.06)] bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
              {STAGE_TYPE_LABELS[stage.stageType]}
            </span>
          </div>
          {editable && onFieldSave ? (
            <EditableText
              value={stage.name}
              onSave={(v) => onFieldSave("name", v)}
              as="h3"
              className="mt-3 text-lg font-semibold text-[#1D1D1F]"
            />
          ) : (
            <h3 className="mt-3 text-lg font-semibold text-[#1D1D1F]">{stage.name}</h3>
          )}
        </div>
        <div className="rounded-xl border border-[rgba(0,0,0,0.06)] bg-white px-3 py-2 text-sm text-slate-600">
          第 {stage.periodStart}-{stage.periodEnd} 课时
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">本阶段要解决的真实问题</p>
            {editable && onFieldSave ? (
              <EditableText
                value={stage.realWorldProblem}
                onSave={(v) => onFieldSave("realWorldProblem", v)}
                as="p"
                className="mt-2 text-sm leading-7 text-slate-700"
                multiline
              />
            ) : (
              <p className="mt-2 text-sm leading-7 text-slate-700">{stage.realWorldProblem}</p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">阶段目标</p>
            {editable && onFieldSave ? (
              <EditableText
                value={stage.objective}
                onSave={(v) => onFieldSave("objective", v)}
                as="p"
                className="mt-2 text-sm leading-7 text-slate-700"
                multiline
              />
            ) : (
              <p className="mt-2 text-sm leading-7 text-slate-700">{stage.objective}</p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">{getImplementationLabel(stage.stageType)}</p>
            <div className="mt-2">
              {editable && onFieldSave ? (
                <EditableList
                  items={stage.implementationSteps}
                  onSave={(v) => onFieldSave("implementationSteps", v)}
                />
              ) : (
                renderBulletList(stage.implementationSteps)
              )}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">核心活动</p>
            <div className="mt-2">
              {editable && onFieldSave ? (
                <EditableList
                  items={stage.coreActivities}
                  onSave={(v) => onFieldSave("coreActivities", v)}
                />
              ) : (
                renderBulletList(stage.coreActivities)
              )}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">证据要求</p>
            <div className="mt-2">
              {editable && onFieldSave ? (
                <EditableList
                  items={stage.evidenceRequirements}
                  onSave={(v) => onFieldSave("evidenceRequirements", v)}
                />
              ) : (
                renderBulletList(stage.evidenceRequirements)
              )}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">知识嵌入</p>
            {editable && onFieldSave ? (
              <EditableText
                value={stage.knowledgeEmbedding}
                onSave={(v) => onFieldSave("knowledgeEmbedding", v)}
                as="p"
                className="mt-2 text-sm leading-7 text-slate-700"
              />
            ) : (
              <p className="mt-2 text-sm leading-7 text-slate-700">{stage.knowledgeEmbedding}</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">教师角色</p>
            {editable && onFieldSave ? (
              <EditableText
                value={stage.teacherRole}
                onSave={(v) => onFieldSave("teacherRole", v)}
                as="p"
                className="mt-2 text-sm leading-7 text-slate-700"
              />
            ) : (
              <p className="mt-2 text-sm leading-7 text-slate-700">{stage.teacherRole}</p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">教师动作</p>
            <div className="mt-2">
              {editable && onFieldSave ? (
                <EditableList
                  items={stage.teacherMoves}
                  onSave={(v) => onFieldSave("teacherMoves", v)}
                />
              ) : (
                renderBulletList(stage.teacherMoves)
              )}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">脚手架策略</p>
            <div className="mt-2">
              {editable && onFieldSave ? (
                <EditableList
                  items={stage.scaffolding}
                  onSave={(v) => onFieldSave("scaffolding", v)}
                />
              ) : (
                renderBulletList(stage.scaffolding)
              )}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">教师检查清单</p>
            <div className="mt-2">
              {editable && onFieldSave ? (
                <EditableList
                  items={stage.checklist}
                  onSave={(v) => onFieldSave("checklist", v)}
                />
              ) : (
                renderBulletList(stage.checklist)
              )}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">反馈重点</p>
            <div className="mt-2">
              {editable && onFieldSave ? (
                <EditableList
                  items={stage.feedbackFocus}
                  onSave={(v) => onFieldSave("feedbackFocus", v)}
                />
              ) : (
                renderBulletList(stage.feedbackFocus)
              )}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">常见偏差</p>
            <div className="mt-2">
              {editable && onFieldSave ? (
                <EditableList
                  items={stage.commonPitfalls}
                  onSave={(v) => onFieldSave("commonPitfalls", v)}
                />
              ) : (
                renderBulletList(stage.commonPitfalls)
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">阶段产出</p>
              <div className="mt-2">
                {editable && onFieldSave ? (
                  <EditableList
                    items={stage.deliverables}
                    onSave={(v) => onFieldSave("deliverables", v)}
                  />
                ) : (
                  renderBulletList(stage.deliverables)
                )}
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">达标标准</p>
              <div className="mt-2">
                {editable && onFieldSave ? (
                  <EditableList
                    items={stage.deliverableCriteria}
                    onSave={(v) => onFieldSave("deliverableCriteria", v)}
                  />
                ) : (
                  renderBulletList(stage.deliverableCriteria)
                )}
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">所需资源</p>
            <div className="mt-2">
              {editable && onFieldSave ? (
                <EditableList
                  items={stage.requiredResources}
                  onSave={(v) => onFieldSave("requiredResources", v)}
                />
              ) : (
                renderBulletList(stage.requiredResources)
              )}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">时间建议</p>
            {editable && onFieldSave ? (
              <EditableText
                value={stage.timeSuggestion}
                onSave={(v) => onFieldSave("timeSuggestion", v)}
                as="p"
                className="mt-2 text-sm leading-7 text-slate-700"
              />
            ) : (
              <p className="mt-2 text-sm leading-7 text-slate-700">{stage.timeSuggestion}</p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function GuidanceBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#F7F7F7] p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3">{renderBulletList(items)}</div>
    </div>
  );
}

async function saveField(planId: string, path: string, value: string | string[]) {
  const res = await fetch(`/api/pbl/projects/${planId}/update-field`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, value }),
  });
  if (!res.ok) {
    console.error("update-field 失败", await res.text());
    return null;
  }
  const data = await res.json();
  return data.plan as PblPlan | null;
}

export function ProjectPlanView({ plan, editable, onPlanChange, showStudentVersion = true }: ProjectPlanViewProps) {
  const handleTopLevelSave = useCallback(
    async (field: string, value: string | string[]) => {
      const updated = await saveField(plan.id, field, value);
      if (updated && onPlanChange) onPlanChange(updated);
    },
    [plan.id, onPlanChange],
  );

  const handleStageSave = useCallback(
    async (stageIndex: number, field: string, value: string | string[]) => {
      const updated = await saveField(plan.id, `stages.${stageIndex}.${field}`, value);
      if (updated && onPlanChange) onPlanChange(updated);
    },
    [plan.id, onPlanChange],
  );
  const materialReferencesPreview = plan.materialReferences.slice(0, 4);
  const hiddenMaterialCount = Math.max(0, plan.materialReferences.length - materialReferencesPreview.length);
  const hasQualityCheck = plan.qualityCheck.length > 0;
  const hasCurriculumAlignment = plan.curriculumAlignment.length > 0;
  const hasAssessments = plan.assessments.length > 0;
  const hasRubric = plan.rubric.length > 0;
  const hasTeacherGuidance =
    plan.teacherGuidance.commonDifficulties.length > 0 ||
    plan.teacherGuidance.differentiation.length > 0 ||
    plan.teacherGuidance.timeManagement.length > 0 ||
    plan.teacherGuidance.crossDisciplineCollab.length > 0;
  const hasStudentVersion = Boolean(plan.studentVersionMarkdown.trim());

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-[rgba(0,0,0,0.06)] bg-white shadow-xs">
        <div className="bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_48%,#334155_100%)] px-6 py-6 text-white">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">
                  {plan.curriculumSystem}
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">
                  {plan.primarySubject}
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">
                  {plan.grade}
                </span>
                <span className="rounded-full border border-amber-300/30 bg-amber-300/12 px-3 py-1 text-xs font-medium text-amber-100">
                  PBL 项目方案
                </span>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight">{plan.title}</h1>
              {editable && onPlanChange ? (
                <EditableText
                  value={plan.projectBrief.realWorldContext || plan.overviewText}
                  onSave={(v) => handleTopLevelSave("overviewText", v)}
                  as="p"
                  className="mt-4 max-w-3xl text-sm leading-7 text-slate-200"
                  multiline
                />
              ) : (
                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-200">
                  {plan.projectBrief.realWorldContext || plan.overviewText}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 lg:min-w-[300px]">
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-300">难度</p>
                <p className="mt-2 text-lg font-semibold">{DIFFICULTY_LABELS[plan.difficulty]}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-300">课时</p>
                <p className="mt-2 text-lg font-semibold">{plan.totalPeriods} 课时</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-300">分组</p>
                <p className="mt-2 text-lg font-semibold">{plan.suggestedGroupSize} 人/组</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-300">组数</p>
                <p className="mt-2 text-lg font-semibold">{plan.suggestedGroupCount} 组</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-100 px-6 py-5">
          <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#F7F7F7] px-5 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-[#6B6F76]">驱动性问题</p>
            {editable && onPlanChange ? (
              <EditableText
                value={plan.drivingQuestion}
                onSave={(v) => handleTopLevelSave("drivingQuestion", v)}
                as="p"
                className="mt-3 text-base font-semibold leading-8 text-[#1D1D1F]"
                multiline
              />
            ) : (
              <p className="mt-3 text-base font-semibold leading-8 text-[#1D1D1F]">{plan.drivingQuestion}</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="成果形式" value={plan.finalOutcomeForm} />
            <StatCard label="展示形式" value={plan.presentationFormat} />
            <StatCard label="目标受众" value={plan.targetAudience} />
          </div>
        </div>
      </section>

      <SectionCard title="方案概览" description="教师版展开方案的核心目标、成果规格与质量状态。">
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#F7F7F7] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[#6B6F76]">最终成果要求</p>
              {editable && onPlanChange ? (
                <EditableText
                  value={plan.finalOutcomeRequirements}
                  onSave={(v) => handleTopLevelSave("finalOutcomeRequirements", v)}
                  as="p"
                  className="mt-3 text-sm leading-7 text-slate-700"
                  multiline
                />
              ) : (
                <p className="mt-3 text-sm leading-7 text-slate-700">{plan.finalOutcomeRequirements}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <StatCard label="创建时间" value={formatDateTime(plan.createdAt)} />
              <StatCard label="更新时间" value={formatDateTime(plan.updatedAt)} />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
            <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#F7F7F7] p-4">
              <h3 className="text-sm font-semibold text-slate-900">项目简报</h3>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">真实场景</p>
                    <p className="mt-2 text-sm leading-7 text-slate-700">{plan.projectBrief.realWorldContext}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">核心挑战</p>
                    <p className="mt-2 text-sm leading-7 text-slate-700">{plan.projectBrief.coreChallenge}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">研究边界</p>
                    <p className="mt-2 text-sm leading-7 text-slate-700">{plan.projectBrief.researchBoundary}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">关键主体</p>
                    <div className="mt-2">{renderBulletList(plan.projectBrief.stakeholders)}</div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">达标标准</p>
                    <div className="mt-2">{renderBulletList(plan.projectBrief.successCriteria)}</div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-[#6B6F76]">建议优先抓取的证据</p>
                    <div className="mt-2">{renderBulletList(plan.projectBrief.recommendedEvidence)}</div>
                  </div>
                </div>
              </div>
            </div>

            {hasQualityCheck ? (
              <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-900">质量检查</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {plan.qualityCheck.map((item) => (
                    <div
                      key={`${item.key}-${item.status}`}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium",
                        QUALITY_STATUS_STYLES[item.status],
                      )}
                    >
                      {formatQualityKey(item.key)} · {QUALITY_STATUS_LABELS[item.status]}
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-3">
                  {plan.qualityCheck.map((item) =>
                    item.note ? (
                      <div key={`${item.key}-note`} className="rounded-xl bg-[#F7F7F7] px-3 py-2 text-sm text-slate-600">
                        <span className="font-medium text-slate-900">{formatQualityKey(item.key)}：</span>
                        {item.note}
                      </div>
                    ) : null,
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="阶段设计" description="按课时推进的任务结构、教师介入点与学生产出。">
        <div className="space-y-4">
          {plan.stages.map((stage, index) => (
            <StageCard
              key={`${stage.stageNumber}-${stage.stageType}`}
              stage={stage}
              editable={editable}
              onFieldSave={
                editable && onPlanChange
                  ? (field, value) => handleStageSave(index, field, value)
                  : undefined
              }
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="课标对齐与评估" description="知识点覆盖、素材锚点与过程性/终结性评价。">
        <div className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            {hasCurriculumAlignment ? (
              <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#F7F7F7] p-4">
                <h3 className="text-sm font-semibold text-slate-900">知识点对齐</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {plan.curriculumAlignment.map((item) => (
                    <div
                      key={`${item.knowledgePointCode}-${item.relatedStage}`}
                      className="rounded-xl border border-[rgba(0,0,0,0.06)] bg-white px-3 py-3"
                    >
                      <p className="text-sm font-medium text-slate-900">{item.knowledgePointCode}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        阶段 {item.relatedStage} · {item.coverageType === "core" ? "核心覆盖" : "辅助覆盖"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#F7F7F7] p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">素材引用</h3>
                {hiddenMaterialCount > 0 ? (
                  <span className="rounded-full border border-[rgba(0,0,0,0.06)] bg-white px-2.5 py-1 text-xs text-[#6B6F76]">
                    另有 {hiddenMaterialCount} 条
                  </span>
                ) : null}
              </div>
              <div className="mt-3 space-y-3">
                {materialReferencesPreview.map((item) => {
                  const searchResult = plan.searchResults.find((candidate) => candidate.title === item.title);
                  return (
                    <div
                      key={`${item.materialId}-${item.referenceType}`}
                      className="rounded-xl border border-[rgba(0,0,0,0.06)] bg-white px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-[#6B6F76]">
                          {REFERENCE_TYPE_LABELS[item.referenceType]}
                        </span>
                        {searchResult?.url ? (
                          <a
                            href={searchResult.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium text-slate-900 underline-offset-2 hover:underline"
                          >
                            {item.title}
                          </a>
                        ) : (
                          <p className="text-sm font-medium text-slate-900">{item.title}</p>
                        )}
                      </div>
                      {searchResult?.snippet ? (
                        <p className="mt-2 text-sm leading-6 text-slate-600">{searchResult.snippet}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {hasAssessments ? (
            <div className="grid auto-rows-min items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {plan.assessments.map((item) => (
                <article
                  key={`${item.type}-${item.checkpoint}`}
                  className="self-start rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.checkpoint}</p>
                      <p className="mt-1 text-sm text-[#6B6F76]">{item.type === "formative" ? "形成性评价" : "总结性评价"}</p>
                    </div>
                    <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-medium text-white">
                      {item.weightPercentage}%
                    </span>
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-slate-700">
                    <p>
                      <span className="font-medium text-slate-900">方法：</span>
                      {item.method}
                    </p>
                    <p>
                      <span className="font-medium text-slate-900">关注内容：</span>
                      {item.content}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </SectionCard>

      {hasRubric ? (
        <SectionCard title="评分量规" description="六个维度的等级描述与学生版说明。">
          <RubricTable items={plan.rubric} />
        </SectionCard>
      ) : null}

      {hasTeacherGuidance ? (
        <SectionCard title="教师指导" description="常见困难、分层教学、时间管理与跨学科协作建议。">
          <div className="grid gap-4 md:grid-cols-2">
            <GuidanceBlock title="常见困难" items={plan.teacherGuidance.commonDifficulties} />
            <GuidanceBlock title="分层教学" items={plan.teacherGuidance.differentiation} />
            <GuidanceBlock title="时间管理" items={plan.teacherGuidance.timeManagement} />
            <GuidanceBlock title="跨学科协作" items={plan.teacherGuidance.crossDisciplineCollab} />
          </div>
        </SectionCard>
      ) : null}

      {showStudentVersion && hasStudentVersion ? (
        <SectionCard title="学生版任务书" description="当前为 Markdown 原文，便于复制或继续导出。">
          <div className="rounded-2xl bg-slate-950 p-4 text-slate-50">
            <pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word text-sm leading-7">
              {plan.studentVersionMarkdown}
            </pre>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
