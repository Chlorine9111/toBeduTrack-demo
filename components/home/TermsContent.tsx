"use client";

import { motion } from "motion/react";
import { useHomeI18n } from "@/lib/home/i18n";

const SECTIONS_EN = [
  {
    title: "Acceptance of Terms",
    paragraphs: [
      "By accessing or using Deskmate, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our service.",
      "We reserve the right to modify these terms at any time. Material changes will be communicated via email or in-app notification at least 30 days in advance.",
    ],
  },
  {
    title: "Description of Service",
    paragraphs: [
      "Deskmate is an AI-powered platform that helps AP teachers generate rubrics, worksheets, and practice exams. The service uses artificial intelligence to create educational content aligned with College Board standards.",
      "While we strive for accuracy, AI-generated content should be reviewed by educators before use in a classroom setting. Deskmate is a tool to assist teachers, not replace professional judgment.",
    ],
  },
  {
    title: "User Accounts",
    paragraphs: [
      "You must provide accurate and complete information when creating an account. You are responsible for maintaining the security of your account credentials.",
      "You must be at least 18 years old or have parental/guardian consent to use Deskmate. The service is designed for educators and educational institutions.",
    ],
  },
  {
    title: "Acceptable Use",
    paragraphs: [
      "You may use Deskmate for lawful educational purposes only. You may not use the service to generate content that is harmful, discriminatory, or violates any applicable laws.",
      "You may not attempt to reverse engineer, decompile, or extract our AI models. You may not use automated tools to scrape or bulk-download generated content.",
    ],
  },
  {
    title: "Intellectual Property",
    paragraphs: [
      "Content you generate using Deskmate belongs to you. You retain full ownership of rubrics, worksheets, and exams created through the platform.",
      "The Deskmate platform, including its AI models, user interface, branding, and documentation, is owned by Deskmate Inc. and protected by intellectual property laws.",
    ],
  },
  {
    title: "Payment & Subscriptions",
    paragraphs: [
      "Paid plans are billed on a recurring basis (monthly or annually). You authorize us to charge your payment method for the subscription fees.",
      "You may cancel your subscription at any time. Cancellation takes effect at the end of the current billing period. No refunds are provided for partial billing periods.",
    ],
  },
  {
    title: "Limitation of Liability",
    paragraphs: [
      "Deskmate is provided \"as is\" without warranties of any kind. We do not guarantee that AI-generated content will be error-free or suitable for any specific educational purpose.",
      "To the maximum extent permitted by law, Deskmate's total liability shall not exceed the amount you paid for the service in the 12 months preceding the claim.",
    ],
  },
  {
    title: "Termination",
    paragraphs: [
      "We may suspend or terminate your account if you violate these terms. Upon termination, you may request a copy of your data within 30 days.",
    ],
  },
];

const SECTIONS_ZH = [
  {
    title: "接受条款",
    paragraphs: [
      "通过访问或使用 Deskmate，你同意受这些服务条款的约束。如果你不同意这些条款，请不要使用我们的服务。",
      "我们保留随时修改这些条款的权利。重大变更将至少提前 30 天通过电子邮件或应用内通知告知。",
    ],
  },
  {
    title: "服务描述",
    paragraphs: [
      "Deskmate 是一个 AI 驱动的平台，帮助 AP 教师生成评分标准、练习题和模拟考试。该服务使用人工智能创建与 College Board 标准对齐的教育内容。",
      "虽然我们力求准确，但 AI 生成的内容在课堂使用前应由教育工作者审核。Deskmate 是辅助教师的工具，而非替代专业判断。",
    ],
  },
  {
    title: "用户账户",
    paragraphs: [
      "创建账户时，你必须提供准确完整的信息。你有责任维护账户凭据的安全。",
      "你必须年满 18 岁或获得家长/监护人同意才能使用 Deskmate。该服务专为教育工作者和教育机构设计。",
    ],
  },
  {
    title: "可接受使用",
    paragraphs: [
      "你只能将 Deskmate 用于合法的教育目的。你不得使用该服务生成有害的、歧视性的或违反任何适用法律的内容。",
      "你不得尝试逆向工程、反编译或提取我们的 AI 模型。你不得使用自动化工具抓取或批量下载生成的内容。",
    ],
  },
  {
    title: "知识产权",
    paragraphs: [
      "你使用 Deskmate 生成的内容属于你。你保留通过平台创建的评分标准、练习题和考试的完全所有权。",
      "Deskmate 平台，包括其 AI 模型、用户界面、品牌和文档，归 Deskmate Inc. 所有，受知识产权法保护。",
    ],
  },
  {
    title: "付款与订阅",
    paragraphs: [
      "付费计划按月或按年定期计费。你授权我们从你的支付方式中扣除订阅费用。",
      "你可以随时取消订阅。取消在当前计费周期结束时生效。不提供部分计费周期的退款。",
    ],
  },
  {
    title: "责任限制",
    paragraphs: [
      "Deskmate 按\"原样\"提供，不作任何形式的保证。我们不保证 AI 生成的内容没有错误或适合任何特定的教育目的。",
      "在法律允许的最大范围内，Deskmate 的总责任不超过你在索赔前 12 个月为该服务支付的金额。",
    ],
  },
  {
    title: "终止",
    paragraphs: [
      "如果你违反这些条款，我们可能会暂停或终止你的账户。终止后，你可以在 30 天内请求你的数据副本。",
    ],
  },
];

export default function TermsContent() {
  const { locale, t } = useHomeI18n();
  const sections = locale === "zh" ? SECTIONS_ZH : SECTIONS_EN;

  return (
    <div className="px-6 py-16 md:py-24">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl ">
            {t.termsPage.title}
          </h1>
          <p className="mt-4 text-sm text-default-400">
            {t.termsPage.updated}
          </p>
          <p className="mt-6 text-base leading-relaxed text-default-500">
            {t.termsPage.intro}
          </p>
        </motion.div>

        {/* Sections */}
        <div className="mt-12 space-y-10">
          {sections.map((section, idx) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4 }}
            >
              <h2 className="font-display text-lg font-semibold text-foreground ">
                {idx + 1}. {section.title}
              </h2>
              <div className="mt-3 space-y-3">
                {section.paragraphs.map((p) => (
                  <p
                    key={p.slice(0, 40)}
                    className="text-sm leading-relaxed text-default-500"
                  >
                    {p}
                  </p>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Governing Law */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="mt-12 rounded-xl border border-divider bg-content1 p-6"
        >
          <h2 className="font-display text-base font-semibold text-foreground ">
            {locale === "zh" ? "管辖法律" : "Governing Law"}
          </h2>
          <p className="mt-2 text-sm text-default-400">
            {locale === "zh"
              ? "这些条款受美国加利福尼亚州法律管辖。任何争议应在旧金山县法院解决。"
              : "These terms are governed by the laws of the State of California, United States. Any disputes shall be resolved in the courts of San Francisco County."}
          </p>
          <p className="mt-3 text-sm text-default-400">
            {locale === "zh" ? "有问题？联系 " : "Questions? Contact us at "}
            <a
              href="mailto:legal@deskmate.ai"
              className="link text-foreground underline underline-offset-2"
            >
              legal@deskmate.ai
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
