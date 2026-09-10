"use client";

import { motion } from "motion/react";
import LinkButton from "@/components/shells/LinkButton";
import { useHomeI18n } from "@/lib/home/i18n";

interface Section {
  readonly title: string;
  readonly content: readonly string[];
}

const SECTIONS_EN: readonly Section[] = [
  {
    title: "Scope & Applicability",
    content: [
      "This Privacy Policy applies to all users of the Deskmate platform (\"Service\"), operated by Deskmate Inc. (\"we,\" \"us,\" or \"our\"). It covers data collected through our website at deskmate.ai, our web application, API endpoints, and any related services.",
      "By accessing or using the Service, you acknowledge that you have read, understood, and agree to the practices described in this policy. If you do not agree, please discontinue use of the Service immediately.",
      "This policy does not apply to third-party websites, products, or services linked from our platform, even if they carry the Deskmate brand or logo.",
    ],
  },
  {
    title: "Information We Collect",
    content: [
      "Account Information: When you register, we collect your name, email address, school or institutional affiliation, role (e.g., teacher, administrator), and AP subject preferences.",
      "Content Data: Educational materials you create, generate, or upload within Deskmate, including rubrics, worksheets, lesson plans, exams, and associated metadata such as course, unit, and knowledge tags.",
      "Usage Data: Features accessed, documents generated, search queries, session duration, click patterns, and feature-level engagement metrics.",
      "Device & Technical Data: IP address, browser type and version, operating system, device identifiers, screen resolution, time zone, and referring URLs.",
      "Payment Information: When you subscribe to a paid plan, our payment processor (Stripe) collects billing details. We receive only the last four digits of your card number, card brand, and billing country. We never store full payment credentials.",
      "Communications: Messages you send to our support team, feedback submissions, and survey responses.",
    ],
  },
  {
    title: "How We Use Your Information",
    content: [
      "Service Delivery: To operate, maintain, and improve the Deskmate platform; to generate AI-powered educational content; and to provide customer support.",
      "Personalization: To customize your experience, suggest relevant templates, and tailor AI outputs to your subject area and curriculum preferences.",
      "Analytics & Improvement: To analyze aggregate usage patterns, identify product issues, measure feature adoption, and improve our AI models. Usage analytics are processed in aggregate form and are not used to profile individual users.",
      "Communication: To send transactional emails (account verification, password reset, billing receipts), service announcements, and — with your opt-in consent — educational newsletters and product updates.",
      "Security & Fraud Prevention: To detect, prevent, and respond to security incidents, unauthorized access, and fraudulent activity.",
      "Legal Compliance: To comply with applicable laws, regulations, legal processes, or enforceable governmental requests.",
    ],
  },
  {
    title: "Legal Bases for Processing (GDPR)",
    content: [
      "If you are located in the European Economic Area (EEA), United Kingdom, or Switzerland, we process your personal data under the following legal bases:",
      "Contract Performance: Processing necessary to provide the Service you have requested (e.g., account creation, content generation, subscription management).",
      "Legitimate Interests: Processing necessary for our legitimate business interests, such as product improvement, security, and fraud prevention, where such interests are not overridden by your rights.",
      "Consent: Where you have given explicit consent, such as for marketing communications or optional analytics cookies. You may withdraw consent at any time.",
      "Legal Obligation: Processing necessary to comply with legal requirements to which we are subject.",
    ],
  },
  {
    title: "Data Sharing & Disclosure",
    content: [
      "We do not sell your personal data. We do not rent, trade, or otherwise monetize your information. We share data only in the following limited circumstances:",
      "AI Model Providers: We transmit content to AI providers (Anthropic, OpenAI, Google) for content generation. This data is processed in real time and is not retained by these providers for model training. We maintain Data Processing Agreements (DPAs) with all AI subprocessors.",
      "Infrastructure Providers: We use cloud hosting (Vercel, Supabase/AWS) to store and serve data. All providers maintain SOC 2 Type II certification or equivalent.",
      "Payment Processor: Stripe processes payment transactions. Stripe's privacy policy governs the handling of your payment data.",
      "Analytics: We use privacy-respecting analytics to understand product usage. Data is aggregated and anonymized before analysis.",
      "Legal Requirements: We may disclose data if required by law, subpoena, court order, or governmental regulation, or if we believe disclosure is necessary to protect our rights, your safety, or the safety of others.",
      "Business Transfer: In the event of a merger, acquisition, or sale of assets, user data may be transferred. We will notify you before your data becomes subject to a different privacy policy.",
    ],
  },
  {
    title: "International Data Transfers",
    content: [
      "Deskmate is headquartered in the United States. If you access the Service from outside the U.S., your data will be transferred to and processed in the United States.",
      "For users in the EEA, UK, or Switzerland: We rely on Standard Contractual Clauses (SCCs) approved by the European Commission, supplemented by additional technical and organizational measures, to ensure adequate protection for international transfers.",
      "We conduct Transfer Impact Assessments as required and implement supplementary measures including encryption in transit and at rest, access controls, and contractual obligations with all subprocessors.",
    ],
  },
  {
    title: "Data Retention",
    content: [
      "Active Accounts: We retain your data for as long as your account is active and as needed to provide you the Service.",
      "After Deletion: When you delete your account, we remove or anonymize your personal data within 30 days, except where retention is required by law (e.g., billing records retained for tax compliance for up to 7 years).",
      "Content Data: Educational content you create is deleted upon account deletion. Exported copies remain your responsibility.",
      "Usage Logs: Aggregated, anonymized usage data may be retained indefinitely for product analytics. This data cannot be linked back to individual users.",
      "Backups: Encrypted database backups are rotated on a 90-day cycle. Data deleted from production systems is purged from backups within this window.",
    ],
  },
  {
    title: "Data Security",
    content: [
      "We implement industry-standard technical and organizational measures to protect your data:",
      "Encryption: All data is encrypted in transit using TLS 1.3 and at rest using AES-256 encryption.",
      "Access Controls: Internal access to user data follows the principle of least privilege. Access is restricted to authorized personnel, requires multi-factor authentication, and is logged for audit purposes.",
      "Infrastructure: Data is hosted in SOC 2 Type II certified facilities with physical security controls, redundant power, and network isolation.",
      "Monitoring: We maintain real-time security monitoring, intrusion detection systems, and automated alerting for anomalous activity.",
      "Testing: We conduct regular penetration testing, vulnerability assessments, and code security reviews.",
      "Incident Response: We maintain a documented incident response plan. In the event of a data breach affecting your personal data, we will notify you and relevant supervisory authorities within 72 hours as required by applicable law.",
    ],
  },
  {
    title: "Your Privacy Rights",
    content: [
      "Depending on your jurisdiction, you may have the following rights regarding your personal data:",
      "Right of Access: Request a copy of the personal data we hold about you.",
      "Right to Rectification: Request correction of inaccurate or incomplete personal data.",
      "Right to Erasure (\"Right to be Forgotten\"): Request deletion of your personal data, subject to legal retention requirements.",
      "Right to Data Portability: Receive your data in a structured, commonly used, machine-readable format (JSON or CSV).",
      "Right to Restrict Processing: Request that we limit how we use your data in certain circumstances.",
      "Right to Object: Object to processing based on legitimate interests, including profiling.",
      "Right to Withdraw Consent: Where processing is based on consent, withdraw that consent at any time without affecting the lawfulness of prior processing.",
      "Right to Non-Discrimination: We will not discriminate against you for exercising your privacy rights.",
      "To exercise any of these rights, email privacy@deskmate.ai. We will respond within 30 days (or within the timeframe required by applicable law). We may need to verify your identity before processing your request.",
    ],
  },
  {
    title: "Cookies & Tracking Technologies",
    content: [
      "We use cookies and similar technologies to operate the Service, remember your preferences, and understand how you interact with our platform.",
      "Essential Cookies: Required for the Service to function (authentication, security, load balancing). These cannot be disabled.",
      "Functional Cookies: Remember your preferences such as language selection and theme settings. Disabling these may affect your experience.",
      "Analytics Cookies: Help us understand usage patterns. These are only set with your consent where required by law.",
      "We do not use advertising cookies or third-party tracking pixels. We do not participate in cross-site behavioral advertising.",
      "You can manage cookie preferences through your browser settings or, where applicable, through our cookie consent banner.",
    ],
  },
  {
    title: "Third-Party Subprocessors",
    content: [
      "We engage the following categories of subprocessors to deliver the Service. All subprocessors are bound by Data Processing Agreements:",
      "AI Providers: Anthropic (Claude), OpenAI (GPT), Google (Embedding) — content generation and semantic processing. Data is processed in real time and not retained for training.",
      "Cloud Infrastructure: Vercel (hosting, edge compute), Supabase/AWS (database, storage) — SOC 2 Type II certified.",
      "Payment Processing: Stripe — PCI DSS Level 1 compliant.",
      "Email Delivery: Transactional email services for account notifications.",
      "A complete, up-to-date list of subprocessors is available upon request at privacy@deskmate.ai.",
    ],
  },
  {
    title: "Children's Privacy",
    content: [
      "Deskmate is designed for use by educators and educational professionals. The Service is not directed at individuals under the age of 13 (or the applicable age of digital consent in your jurisdiction).",
      "We do not knowingly collect personal information from children. If we become aware that we have inadvertently collected data from a child, we will take immediate steps to delete such data.",
      "Educators using Deskmate should not input personally identifiable student data into the platform. The Service is designed for curriculum and content generation, not student data management.",
      "If you believe a child has provided us with personal information, please contact us at privacy@deskmate.ai.",
    ],
  },
  {
    title: "California Privacy Rights (CCPA/CPRA)",
    content: [
      "If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA) as amended by the California Privacy Rights Act (CPRA):",
      "Right to Know: You may request disclosure of the categories and specific pieces of personal information we have collected, the sources of collection, the business purpose, and the categories of third parties with whom we share data.",
      "Right to Delete: You may request deletion of your personal information, subject to certain exceptions.",
      "Right to Opt-Out of Sale: We do not sell personal information. We do not share personal information for cross-context behavioral advertising.",
      "Right to Non-Discrimination: We will not deny you goods or services, charge different prices, or provide a different quality of service for exercising your CCPA rights.",
      "To submit a CCPA request, email privacy@deskmate.ai or use the \"Manage Data\" option in your account settings.",
    ],
  },
  {
    title: "Changes to This Policy",
    content: [
      "We may update this Privacy Policy from time to time to reflect changes in our practices, legal requirements, or the Service itself.",
      "Material Changes: For significant changes that affect how we handle your data, we will provide at least 30 days' advance notice via email and/or a prominent in-app notification before the changes take effect.",
      "Non-Material Changes: Minor clarifications or formatting updates may be made without advance notice. The \"Last updated\" date at the top of this page will always reflect the most recent revision.",
      "Continued use of the Service after the effective date of a revised policy constitutes your acceptance of the updated terms. If you disagree with the changes, you may close your account and request deletion of your data.",
    ],
  },
];

const SECTIONS_ZH: readonly Section[] = [
  {
    title: "适用范围",
    content: [
      "本隐私政策适用于 Deskmate 平台（「服务」）的所有用户，由 Deskmate Inc.（「我们」）运营。它涵盖通过我们的网站 deskmate.ai、Web 应用程序、API 端点及任何相关服务收集的数据。",
      "通过访问或使用本服务，你确认已阅读、理解并同意本政策中描述的做法。如果你不同意，请立即停止使用本服务。",
      "本政策不适用于从我们平台链接的第三方网站、产品或服务，即使它们带有 Deskmate 品牌或标识。",
    ],
  },
  {
    title: "我们收集的信息",
    content: [
      "账户信息：注册时，我们收集你的姓名、电子邮件地址、学校或机构归属、角色（如教师、管理员）和 AP 学科偏好。",
      "内容数据：你在 Deskmate 中创建、生成或上传的教育材料，包括评分标准、练习题、教案、考试及相关元数据（如课程、单元和知识标签）。",
      "使用数据：访问的功能、生成的文档、搜索查询、会话时长、点击模式和功能级参与度指标。",
      "设备与技术数据：IP 地址、浏览器类型和版本、操作系统、设备标识符、屏幕分辨率、时区和来源 URL。",
      "支付信息：订阅付费计划时，我们的支付处理器（Stripe）收集账单详情。我们仅接收你的卡号后四位、卡品牌和账单国家。我们绝不存储完整的支付凭据。",
      "通信：你发送给我们支持团队的消息、反馈提交和调查回复。",
    ],
  },
  {
    title: "我们如何使用你的信息",
    content: [
      "服务提供：运营、维护和改进 Deskmate 平台；生成 AI 驱动的教育内容；提供客户支持。",
      "个性化：定制你的体验，推荐相关模板，并根据你的学科领域和课程偏好调整 AI 输出。",
      "分析与改进：分析汇总使用模式、识别产品问题、衡量功能采用率并改进我们的 AI 模型。使用分析以汇总形式处理，不用于对个人用户进行画像。",
      "通信：发送事务性邮件（账户验证、密码重置、账单收据）、服务公告，以及——经你选择同意——教育通讯和产品更新。",
      "安全与欺诈防范：检测、预防和应对安全事件、未经授权的访问和欺诈活动。",
      "法律合规：遵守适用的法律、法规、法律程序或可执行的政府请求。",
    ],
  },
  {
    title: "处理的法律基础（GDPR）",
    content: [
      "如果你位于欧洲经济区（EEA）、英国或瑞士，我们根据以下法律基础处理你的个人数据：",
      "合同履行：提供你所请求的服务所必需的处理（如账户创建、内容生成、订阅管理）。",
      "合法利益：我们的合法商业利益所必需的处理，如产品改进、安全和欺诈防范，前提是这些利益不会凌驾于你的权利之上。",
      "同意：你已给予明确同意的情况，如营销通信或可选的分析 Cookie。你可以随时撤回同意。",
      "法律义务：遵守我们所受法律要求所必需的处理。",
    ],
  },
  {
    title: "数据共享与披露",
    content: [
      "我们不出售你的个人数据。我们不出租、交易或以其他方式将你的信息变现。我们仅在以下有限情况下共享数据：",
      "AI 模型提供商：我们将内容传输至 AI 提供商（Anthropic、OpenAI、Google）用于内容生成。这些数据实时处理，不被这些提供商保留用于模型训练。我们与所有 AI 子处理器签订了数据处理协议（DPA）。",
      "基础设施提供商：我们使用云托管（Vercel、Supabase/AWS）来存储和提供数据。所有提供商均持有 SOC 2 Type II 认证或同等资质。",
      "支付处理器：Stripe 处理支付交易。Stripe 的隐私政策管辖你的支付数据的处理。",
      "分析：我们使用尊重隐私的分析来了解产品使用情况。数据在分析前经过汇总和匿名化。",
      "法律要求：如果法律、传票、法院命令或政府法规要求，或者我们认为披露是保护我们的权利、你的安全或他人安全所必需的，我们可能会披露数据。",
      "业务转让：在合并、收购或资产出售的情况下，用户数据可能会被转让。在你的数据受不同隐私政策约束之前，我们将通知你。",
    ],
  },
  {
    title: "国际数据传输",
    content: [
      "Deskmate 总部位于美国。如果你从美国以外的地方访问本服务，你的数据将被传输到美国并在美国处理。",
      "对于 EEA、英国或瑞士的用户：我们依赖欧洲委员会批准的标准合同条款（SCC），辅以额外的技术和组织措施，以确保国际传输的充分保护。",
      "我们根据要求进行传输影响评估，并实施补充措施，包括传输和静态加密、访问控制以及与所有子处理器的合同义务。",
    ],
  },
  {
    title: "数据保留",
    content: [
      "活跃账户：只要你的账户处于活跃状态且需要为你提供服务，我们就会保留你的数据。",
      "删除后：当你删除账户时，我们在 30 天内删除或匿名化你的个人数据，除非法律要求保留（如为税务合规保留的账单记录，最长 7 年）。",
      "内容数据：你创建的教育内容在账户删除时一并删除。导出的副本由你自行负责。",
      "使用日志：汇总的匿名化使用数据可能会被无限期保留用于产品分析。这些数据无法关联回个人用户。",
      "备份：加密的数据库备份以 90 天为周期轮换。从生产系统删除的数据将在此窗口期内从备份中清除。",
    ],
  },
  {
    title: "数据安全",
    content: [
      "我们实施行业标准的技术和组织措施来保护你的数据：",
      "加密：所有数据在传输中使用 TLS 1.3 加密，静态使用 AES-256 加密。",
      "访问控制：内部对用户数据的访问遵循最小权限原则。访问仅限授权人员，需要多因素身份验证，并记录日志以供审计。",
      "基础设施：数据托管在 SOC 2 Type II 认证的设施中，具备物理安全控制、冗余电力和网络隔离。",
      "监控：我们维护实时安全监控、入侵检测系统和异常活动自动警报。",
      "测试：我们定期进行渗透测试、漏洞评估和代码安全审查。",
      "事件响应：我们维护有文档记录的事件响应计划。如果发生影响你个人数据的数据泄露，我们将在适用法律要求的 72 小时内通知你和相关监管机构。",
    ],
  },
  {
    title: "你的隐私权利",
    content: [
      "根据你的管辖区域，你可能对个人数据拥有以下权利：",
      "访问权：请求我们持有的关于你的个人数据副本。",
      "更正权：请求更正不准确或不完整的个人数据。",
      "删除权（「被遗忘权」）：请求删除你的个人数据，但须遵守法律保留要求。",
      "数据可携权：以结构化、通用的、机器可读的格式（JSON 或 CSV）接收你的数据。",
      "限制处理权：在某些情况下请求我们限制使用你的数据。",
      "反对权：反对基于合法利益的处理，包括画像。",
      "撤回同意权：如处理基于同意，可随时撤回该同意，且不影响撤回前处理的合法性。",
      "不受歧视权：我们不会因你行使隐私权利而歧视你。",
      "如需行使上述任何权利，请发送邮件至 privacy@deskmate.ai。我们将在 30 天内（或适用法律要求的时间范围内）回复。我们可能需要在处理你的请求之前验证你的身份。",
    ],
  },
  {
    title: "Cookie 与跟踪技术",
    content: [
      "我们使用 Cookie 和类似技术来运营服务、记住你的偏好，并了解你如何与平台互动。",
      "必要 Cookie：服务运行所必需（身份验证、安全、负载均衡）。这些不能被禁用。",
      "功能 Cookie：记住你的偏好，如语言选择和主题设置。禁用可能影响你的体验。",
      "分析 Cookie：帮助我们了解使用模式。这些仅在法律要求时经你同意后设置。",
      "我们不使用广告 Cookie 或第三方跟踪像素。我们不参与跨站行为广告。",
      "你可以通过浏览器设置或（如适用）通过我们的 Cookie 同意横幅管理 Cookie 偏好。",
    ],
  },
  {
    title: "第三方子处理器",
    content: [
      "我们使用以下类别的子处理器来提供服务。所有子处理器均受数据处理协议约束：",
      "AI 提供商：Anthropic (Claude)、OpenAI (GPT)、Google (Embedding) — 内容生成和语义处理。数据实时处理，不保留用于训练。",
      "云基础设施：Vercel（托管、边缘计算）、Supabase/AWS（数据库、存储）— SOC 2 Type II 认证。",
      "支付处理：Stripe — PCI DSS Level 1 合规。",
      "邮件投递：用于账户通知的事务性邮件服务。",
      "可应要求提供完整的、最新的子处理器列表，请发邮件至 privacy@deskmate.ai。",
    ],
  },
  {
    title: "儿童隐私",
    content: [
      "Deskmate 专为教育工作者和教育专业人士设计。本服务不面向 13 岁以下（或你所在司法管辖区适用的数字同意年龄以下）的个人。",
      "我们不会故意收集儿童的个人信息。如果我们发现无意中收集了儿童的数据，我们将立即采取措施删除该数据。",
      "使用 Deskmate 的教育工作者不应将可识别个人身份的学生数据输入平台。本服务是为课程和内容生成设计的，而非学生数据管理。",
      "如果你认为某个儿童向我们提供了个人信息，请联系 privacy@deskmate.ai。",
    ],
  },
  {
    title: "加州隐私权利（CCPA/CPRA）",
    content: [
      "如果你是加州居民，你根据《加州消费者隐私法》（CCPA）及其修订版《加州隐私权法》（CPRA）享有额外权利：",
      "知情权：你可以要求披露我们收集的个人信息类别和具体内容、收集来源、商业目的以及我们与之共享数据的第三方类别。",
      "删除权：你可以要求删除你的个人信息，但须遵守特定例外。",
      "拒绝出售权：我们不出售个人信息。我们不为跨上下文行为广告共享个人信息。",
      "不受歧视权：我们不会因你行使 CCPA 权利而拒绝向你提供商品或服务、收取不同价格或提供不同质量的服务。",
      "如需提交 CCPA 请求，请发邮件至 privacy@deskmate.ai 或使用你账户设置中的「管理数据」选项。",
    ],
  },
  {
    title: "本政策的变更",
    content: [
      "我们可能会不时更新本隐私政策，以反映我们实践、法律要求或服务本身的变化。",
      "重大变更：对于影响我们处理你数据方式的重大变更，我们将在变更生效前至少提前 30 天通过电子邮件和/或显著的应用内通知提供通知。",
      "非重大变更：细微的澄清或格式更新可能在没有提前通知的情况下进行。本页顶部的「最后更新」日期将始终反映最近的修订。",
      "在修订后的政策生效日期之后继续使用本服务即构成你对更新条款的接受。如果你不同意这些变更，你可以关闭账户并请求删除你的数据。",
    ],
  },
];

export default function PrivacyContent() {
  const { locale, t } = useHomeI18n();
  const sections = locale === "zh" ? SECTIONS_ZH : SECTIONS_EN;
  const isZh = locale === "zh";

  return (
    <div className="px-6 py-16 md:py-24">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            {t.privacyPage.title}
          </h1>
          <p className="mt-4 text-sm text-default-400">
            {t.privacyPage.updated}
          </p>
          <p className="mt-6 text-base leading-relaxed text-default-500">
            {t.privacyPage.intro}
          </p>
        </motion.div>

        {/* Table of Contents */}
        <motion.nav
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mt-10 rounded-xl border border-divider bg-default-100 p-6"
        >
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-default-400">
            {isZh ? "目录" : "Contents"}
          </h2>
          <ol className="columns-1 gap-x-8 space-y-1.5 text-sm md:columns-2">
            {sections.map((s, i) => (
              <li key={s.title}>
                <a
                  href={`#privacy-${i + 1}`}
                  className="text-default-500 transition-colors hover:text-foreground"
                >
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </motion.nav>

        {/* Sections */}
        <div className="mt-12 space-y-10">
          {sections.map((section, idx) => (
            <motion.div
              key={section.title}
              id={`privacy-${idx + 1}`}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4 }}
            >
              <h2 className="text-lg font-semibold text-foreground">
                {idx + 1}. {section.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {section.content.map((item) => (
                  <li
                    key={item.slice(0, 50)}
                    className="flex items-start gap-2.5 text-sm leading-relaxed text-default-500"
                  >
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-default-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Contact & Related Links */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="mt-16 space-y-6"
        >
          <div className="rounded-xl border border-divider bg-default-100 p-6">
            <h2 className="text-base font-semibold text-foreground">
              {isZh ? "联系我们" : "Contact Us"}
            </h2>
            <p className="mt-2 text-sm text-default-500">
              {isZh
                ? "如果你对本隐私政策有任何疑问或希望行使你的隐私权利，请通过以下方式联系我们的数据保护团队："
                : "If you have any questions about this Privacy Policy or wish to exercise your privacy rights, please contact our Data Protection team:"}
            </p>
            <div className="mt-3 space-y-1 text-sm text-default-500">
              <p>
                {isZh ? "邮箱：" : "Email: "}
                <a href="mailto:privacy@deskmate.ai" className="font-medium text-foreground underline underline-offset-2">
                  privacy@deskmate.ai
                </a>
              </p>
              <p>Deskmate Inc., San Francisco, CA, United States</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <LinkButton
              href="/terms"
              variant="outline"
              className="rounded-lg px-4 py-2 text-sm font-medium"
            >
              {isZh ? "服务条款" : "Terms of Service"} &rarr;
            </LinkButton>
            <LinkButton
              href="mailto:privacy@deskmate.ai?subject=DPA%20Request"
              variant="outline"
              className="rounded-lg px-4 py-2 text-sm font-medium"
            >
              {isZh ? "请求数据处理协议 (DPA)" : "Request a DPA"} &rarr;
            </LinkButton>
            <LinkButton
              href="mailto:privacy@deskmate.ai?subject=Data%20Export%20Request"
              variant="outline"
              className="rounded-lg px-4 py-2 text-sm font-medium"
            >
              {isZh ? "请求数据导出" : "Request Data Export"} &rarr;
            </LinkButton>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
