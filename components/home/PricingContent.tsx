"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import { Button, Card, Chip, Accordion } from "@heroui/react";
import { cn } from "@/lib/utils";
import LinkButton from "@/components/shells/LinkButton";
import { useHomeI18n } from "@/lib/home/i18n";

// ---------------------------------------------------------------------------
// Plan config (not in translations because it includes layout/style data)
// ---------------------------------------------------------------------------

interface PlanConfig {
  readonly labelEn: string;
  readonly labelZh: string;
  readonly titleEn: string;
  readonly titleZh: string;
  readonly descEn: string;
  readonly descZh: string;
  readonly priceDisplay: "free" | "coming-soon" | "contact";
  readonly ctaEn: string;
  readonly ctaZh: string;
  readonly ctaHref: string;
  readonly popular: boolean;
  readonly featuresEn: readonly { text: string; included: boolean }[];
  readonly featuresZh: readonly { text: string; included: boolean }[];
}

const PLANS: readonly PlanConfig[] = [
  {
    labelEn: "Beta",
    labelZh: "内测版",
    titleEn: "Free",
    titleZh: "免费版",
    descEn: "Currently in beta — all features unlocked with generous limits.",
    descZh: "当前处于内测阶段 — 所有功能免费开放，有额度限制。",
    priceDisplay: "free",
    ctaEn: "Start for Free",
    ctaZh: "免费开始",
    ctaHref: "/main",
    popular: false,
    featuresEn: [
      { text: "All AI generation features", included: true },
      { text: "Rubric, worksheet & exam builder", included: true },
      { text: "Lesson plan generation", included: true },
      { text: "Question bank & content library", included: true },
      { text: "PDF & DOCX export", included: true },
      { text: "Community support", included: true },
      { text: "Usage limits apply during beta", included: true },
    ],
    featuresZh: [
      { text: "所有 AI 生成功能", included: true },
      { text: "评分标准、练习题和考试构建", included: true },
      { text: "教案生成", included: true },
      { text: "题库与内容库", included: true },
      { text: "PDF 和 DOCX 导出", included: true },
      { text: "社区支持", included: true },
      { text: "内测期间有使用额度限制", included: true },
    ],
  },
  {
    labelEn: "Individual",
    labelZh: "个人版",
    titleEn: "Plus",
    titleZh: "Plus",
    descEn: "For teachers who want higher limits and priority access.",
    descZh: "适合需要更高额度和优先访问的教师。",
    priceDisplay: "coming-soon",
    ctaEn: "Coming Soon",
    ctaZh: "即将推出",
    ctaHref: "#",
    popular: false,
    featuresEn: [
      { text: "Everything in Free", included: true },
      { text: "Higher generation limits", included: true },
      { text: "Priority AI processing", included: true },
      { text: "Custom templates", included: true },
      { text: "Advanced export options", included: true },
      { text: "Email support", included: true },
    ],
    featuresZh: [
      { text: "免费版全部功能", included: true },
      { text: "更高的生成额度", included: true },
      { text: "AI 优先处理", included: true },
      { text: "自定义模板", included: true },
      { text: "高级导出选项", included: true },
      { text: "邮件支持", included: true },
    ],
  },
  {
    labelEn: "Power User",
    labelZh: "高级版",
    titleEn: "Pro",
    titleZh: "Pro",
    descEn: "Unlimited access for educators who rely on Deskmate daily.",
    descZh: "为每天依赖 Deskmate 的教育工作者提供无限访问。",
    priceDisplay: "coming-soon",
    ctaEn: "Coming Soon",
    ctaZh: "即将推出",
    ctaHref: "#",
    popular: true,
    featuresEn: [
      { text: "Everything in Plus", included: true },
      { text: "Unlimited generation", included: true },
      { text: "PBL project tools", included: true },
      { text: "Content library with AI search", included: true },
      { text: "LMS integration", included: true },
      { text: "Priority support", included: true },
      { text: "Early access to new features", included: true },
    ],
    featuresZh: [
      { text: "Plus 全部功能", included: true },
      { text: "无限生成", included: true },
      { text: "PBL 项目工具", included: true },
      { text: "内容库 AI 语义搜索", included: true },
      { text: "LMS 集成", included: true },
      { text: "优先支持", included: true },
      { text: "新功能抢先体验", included: true },
    ],
  },
  {
    labelEn: "Institution",
    labelZh: "团队版",
    titleEn: "Team",
    titleZh: "Team",
    descEn: "For school departments, districts, and educational organizations.",
    descZh: "适合学校部门、学区和教育机构。",
    priceDisplay: "contact",
    ctaEn: "Contact Us",
    ctaZh: "联系我们",
    ctaHref: "mailto:hello@deskmate.ai?subject=Team%20Plan%20Inquiry",
    popular: false,
    featuresEn: [
      { text: "Everything in Pro", included: true },
      { text: "Unlimited teacher seats", included: true },
      { text: "Shared template library", included: true },
      { text: "Admin dashboard & analytics", included: true },
      { text: "SSO & provisioning", included: true },
      { text: "Dedicated account manager", included: true },
      { text: "Custom onboarding & training", included: true },
      { text: "SLA & phone support", included: true },
    ],
    featuresZh: [
      { text: "Pro 全部功能", included: true },
      { text: "无限教师席位", included: true },
      { text: "共享模板库", included: true },
      { text: "管理员仪表盘与数据分析", included: true },
      { text: "SSO 单点登录与自动配置", included: true },
      { text: "专属客户经理", included: true },
      { text: "定制入职培训", included: true },
      { text: "SLA 和电话支持", included: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

const FAQ_EN = [
  { q: "Is Deskmate really free right now?", a: "Yes! We are currently in beta and all features are free to use. There are usage limits during this period, but you get access to every feature — rubric generation, exam building, lesson plans, question bank, and more." },
  { q: "What happens when the beta ends?", a: "When we launch paid plans, existing beta users will receive priority pricing and an extended free period as a thank-you for early feedback. You will be notified well in advance before any changes take effect." },
  { q: "What are the usage limits during beta?", a: "During beta, each account has daily and monthly generation limits that refresh automatically. These limits are generous enough for regular classroom use. If you need higher limits for a specific project, reach out to us." },
  { q: "Will I lose my data when pricing launches?", a: "Absolutely not. All content you create during beta — rubrics, exams, lesson plans, question bank items — remains yours and will carry over seamlessly to any plan you choose." },
  { q: "Can I use Deskmate with my whole department?", a: "During beta, each teacher needs their own account. When Team plans launch, you will be able to manage multiple seats, share templates, and access admin analytics under a single billing account." },
  { q: "Do you offer discounts for schools?", a: "Yes. When paid plans launch, we will offer volume discounts for school-wide and district-wide deployments. Contact us at hello@deskmate.ai to be added to the early access list." },
  { q: "How secure is my data?", a: "All data is encrypted in transit (TLS 1.3) and at rest (AES-256). We follow SOC 2 practices, never share your content with third parties, and maintain Data Processing Agreements with all AI subprocessors. See our Privacy Policy for full details." },
  { q: "What AI models does Deskmate use?", a: "We use a combination of leading AI models (Anthropic Claude, OpenAI, Google) optimized for educational content generation. Your content is processed in real time and is never used to train these models." },
  { q: "Can I export my content?", a: "Yes. You can export rubrics, worksheets, exams, and lesson plans as PDF or DOCX files. During beta, all export features are available at no cost." },
];

const FAQ_ZH = [
  { q: "Deskmate 现在真的免费吗？", a: "是的！我们目前处于内测阶段，所有功能免费使用。内测期间有使用额度限制，但你可以使用每一项功能 — 评分标准生成、考试构建、教案、题库等。" },
  { q: "内测结束后会怎样？", a: "当我们推出付费计划时，现有内测用户将获得优先定价和延长的免费期，作为对早期反馈的感谢。在任何变更生效之前，我们会提前通知你。" },
  { q: "内测期间的使用额度是多少？", a: "内测期间，每个账户有每日和每月的生成额度限制，会自动刷新。这些额度对日常课堂使用来说是足够的。如果你的特定项目需要更高额度，请联系我们。" },
  { q: "定价推出后我的数据会丢失吗？", a: "绝对不会。你在内测期间创建的所有内容 — 评分标准、考试、教案、题库条目 — 都属于你，并将无缝延续到你选择的任何计划。" },
  { q: "我可以和整个教研组一起使用 Deskmate 吗？", a: "内测期间，每位教师需要自己的账户。当 Team 计划推出时，你将能够在一个账单账户下管理多个席位、共享模板并使用管理分析功能。" },
  { q: "你们提供学校折扣吗？", a: "是的。付费计划推出时，我们将为全校和全学区部署提供批量折扣。请发邮件至 hello@deskmate.ai 加入早期访问列表。" },
  { q: "我的数据安全吗？", a: "所有数据在传输中（TLS 1.3）和静态（AES-256）均已加密。我们遵循 SOC 2 实践，从不与第三方共享你的内容，并与所有 AI 子处理器签订了数据处理协议。详见我们的隐私政策。" },
  { q: "Deskmate 使用什么 AI 模型？", a: "我们使用多个领先 AI 模型（Anthropic Claude、OpenAI、Google）的组合，针对教育内容生成进行了优化。你的内容实时处理，绝不会被用于训练这些模型。" },
  { q: "我可以导出我的内容吗？", a: "可以。你可以将评分标准、练习题、考试和教案导出为 PDF 或 DOCX 文件。内测期间，所有导出功能免费提供。" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PricingContent() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { locale } = useHomeI18n();
  const isZh = locale === "zh";
  const faqItems = isZh ? FAQ_ZH : FAQ_EN;

  return (
    <div className="px-6 py-16 md:py-24">
      <div className="mx-auto max-w-[1200px]">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] text-foreground">
            {isZh ? "简单透明的定价" : "Simple, transparent pricing"}
          </h1>
          <p className="mt-4 text-lg text-default-500 max-w-2xl mx-auto font-medium">
            {isZh
              ? "目前处于免费内测阶段 — 所有功能免费开放，付费计划即将推出。"
              : "Currently in free beta — all features unlocked. Paid plans coming soon."}
          </p>

          {/* Beta badge */}
          <div className="mt-6">
            <Chip color="success" className="gap-2 px-5 py-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4" />
              {isZh
                ? "内测中 · 所有功能免费 · 有额度限制"
                : "Beta · All features free · Usage limits apply"}
            </Chip>
          </div>
        </motion.div>

        {/* Pricing cards — 4 columns */}
        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-32">
          {PLANS.map((plan, idx) => {
            const isPopular = plan.popular;
            const isFree = plan.priceDisplay === "free";
            const isComingSoon = plan.priceDisplay === "coming-soon";
            const isContact = plan.priceDisplay === "contact";
            const features = isZh ? plan.featuresZh : plan.featuresEn;

            return (
              <motion.div
                key={plan.titleEn}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.08 }}
                className={cn(
                  "relative flex flex-col rounded-2xl p-8 transition-transform duration-300",
                  isPopular
                    ? "bg-white border-2 border-foreground shadow-xl lg:scale-[1.03] z-10"
                    : isFree
                      ? "bg-emerald-50/50 border border-emerald-200/40"
                      : "bg-default-100 border border-transparent hover:translate-y-[-2px]"
                )}
              >
                {/* Popular badge */}
                {isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      {isZh ? "即将推出" : "Coming Soon"}
                    </span>
                  </div>
                )}

                {/* Beta badge on free plan */}
                {isFree && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      <Sparkles className="h-3 w-3" />
                      {isZh ? "免费内测中" : "Free Beta"}
                    </span>
                  </div>
                )}

                <div className="mb-5 pt-2">
                  <span className={cn(
                    "text-[11px] font-bold uppercase tracking-[0.12em]",
                    isFree ? "text-emerald-600" : isPopular ? "text-foreground" : "text-default-400"
                  )}>
                    {isZh ? plan.labelZh : plan.labelEn}
                  </span>
                  <h3 className="text-2xl font-bold text-foreground mt-1.5">
                    {isZh ? plan.titleZh : plan.titleEn}
                  </h3>
                  <p className="mt-1 text-xs text-default-400 leading-relaxed">
                    {isZh ? plan.descZh : plan.descEn}
                  </p>
                </div>

                {/* Price */}
                <div className="mb-6">
                  {isFree && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-foreground">$0</span>
                      <span className="text-sm text-default-400">
                        {isZh ? "内测期间" : "during beta"}
                      </span>
                    </div>
                  )}
                  {isComingSoon && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-default-200">
                        {isZh ? "价格待定" : "Price TBD"}
                      </span>
                    </div>
                  )}
                  {isContact && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-foreground">Custom</span>
                    </div>
                  )}
                </div>

                {/* CTA */}
                {isFree ? (
                  <LinkButton
                    href={plan.ctaHref}
                    className="mb-6 flex items-center justify-center rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white hover:bg-emerald-700"
                    fullWidth
                  >
                    {isZh ? plan.ctaZh : plan.ctaEn}
                  </LinkButton>
                ) : isComingSoon ? (
                  <Button
                    isDisabled
                    variant="outline"
                    className="mb-6 flex items-center justify-center rounded-xl border-2 border-dashed py-3.5 text-sm font-semibold"
                    fullWidth
                  >
                    {isZh ? plan.ctaZh : plan.ctaEn}
                  </Button>
                ) : (
                  <LinkButton
                    href={plan.ctaHref}
                    variant="outline"
                    className="mb-6 flex items-center justify-center rounded-xl border-2 border-foreground py-3.5 text-sm font-bold text-foreground hover:bg-foreground hover:text-white"
                    fullWidth
                  >
                    {isZh ? plan.ctaZh : plan.ctaEn}
                  </LinkButton>
                )}

                {/* Features */}
                <div className="flex-1 space-y-3 border-t border-divider pt-5">
                  {features.map((f) => (
                    <div key={f.text} className={cn("flex items-center gap-2", !f.included && "opacity-40")}>
                      <div className={cn(
                        "flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full",
                        f.included
                          ? isFree ? "bg-emerald-100 text-emerald-600" : "bg-emerald-100 text-emerald-600"
                          : "bg-default-100 text-default-200"
                      )}>
                        <Check className="h-3 w-3" strokeWidth={2.5} />
                      </div>
                      <span className="text-[13px] text-default-500">{f.text}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* FAQ Section */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mx-auto mb-32"
        >
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            {isZh ? "常见问题" : "Frequently Asked Questions"}
          </h2>
          <Accordion className="space-y-3">
            {faqItems.map((item, idx) => (
              <Accordion.Item key={idx} className="rounded-2xl bg-default-100 transition-colors hover:bg-default-200 overflow-hidden">
                <Accordion.Heading>
                  <Accordion.Trigger className="flex w-full items-center justify-between p-6">
                    <span className="font-semibold text-foreground text-left">{item.q}</span>
                    <Accordion.Indicator className="shrink-0 ml-4" />
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body className="px-6 pb-6">
                    <p className="text-sm leading-relaxed text-default-500">
                      {item.a}
                    </p>
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </motion.div>

        {/* Bottom CTA */}
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="bg-foreground rounded-[3rem] p-16 text-center text-white relative overflow-hidden"
        >
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-default-400 rounded-full blur-[120px]" />
            <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-primary rounded-full blur-[120px]" />
          </div>
          <div className="relative z-10 space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-4 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-300">
                {isZh ? "免费内测中" : "Free Beta"}
              </span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              {isZh
                ? "现在就开始，完全免费。"
                : "Start now. Completely free."}
            </h2>
            <p className="text-white/60 max-w-xl mx-auto text-lg">
              {isZh
                ? "内测期间所有功能免费开放。加入正在使用 Deskmate 提升教学效率的教育工作者。"
                : "All features are free during beta. Join educators who are already saving hours every week with Deskmate."}
            </p>
            <div className="pt-4">
              <LinkButton
                href="/main"
                variant="secondary"
                className="inline-block bg-white text-foreground px-10 py-4 rounded-xl font-bold text-lg hover:shadow-xl hover:scale-105 transition-all"
              >
                {isZh ? "免费开始使用" : "Get Started Free"}
              </LinkButton>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
