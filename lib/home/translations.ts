export type Locale = "en" | "zh";

export interface HomeTranslations {
  readonly nav: {
    readonly features: string;
    readonly pricing: string;
    readonly about: string;
    readonly blog: string;
    readonly tryDemo: string;
    readonly getStarted: string;
  };
  readonly hero: {
    readonly badge: string;
    readonly titleLine1: string;
    readonly titleLine2: string;
    readonly subtitle: string;
    readonly ctaPrimary: string;
    readonly ctaSecondary: string;
    readonly trustLine: string;
  };
  readonly social: {
    readonly stats: readonly { readonly value: string; readonly label: string }[];
    readonly trustedBy: string;
  };
  readonly features: {
    readonly titleLine1: string;
    readonly titleLine2: string;
    readonly subtitle: string;
    readonly items: readonly {
      readonly title: string;
      readonly description: string;
    }[];
  };
  readonly howItWorks: {
    readonly title: string;
    readonly subtitle: string;
    readonly steps: readonly {
      readonly title: string;
      readonly description: string;
    }[];
  };
  readonly subjects: {
    readonly title: string;
    readonly subtitle: string;
  };
  readonly testimonials: {
    readonly title: string;
    readonly subtitle: string;
    readonly items: readonly {
      readonly quote: string;
      readonly author: string;
      readonly role: string;
      readonly school: string;
    }[];
  };
  readonly cta: {
    readonly title: string;
    readonly subtitle: string;
    readonly placeholder: string;
    readonly button: string;
    readonly success: string;
    readonly note: string;
  };
  readonly footer: {
    readonly description: string;
    readonly product: string;
    readonly resources: string;
    readonly company: string;
    readonly privacy: string;
    readonly terms: string;
    readonly copyright: string;
    readonly contact: string;
  };
  readonly pricing: {
    readonly title: string;
    readonly subtitle: string;
    readonly monthly: string;
    readonly yearly: string;
    readonly discount: string;
    readonly popular: string;
    readonly forever: string;
    readonly perMonth: string;
    readonly billedYearly: string;
    readonly faqTitle: string;
    readonly plans: readonly {
      readonly name: string;
      readonly description: string;
      readonly cta: string;
      readonly features: readonly { readonly text: string; readonly included: boolean }[];
    }[];
    readonly faq: readonly { readonly q: string; readonly a: string }[];
  };
  readonly about: {
    readonly badge: string;
    readonly titleLine1: string;
    readonly subtitle: string;
    readonly storyTitle: string;
    readonly storyParagraphs: readonly string[];
    readonly valuesTitle: string;
    readonly valuesSubtitle: string;
    readonly values: readonly {
      readonly title: string;
      readonly description: string;
    }[];
    readonly ctaTitle: string;
    readonly ctaSubtitle: string;
    readonly ctaButton: string;
  };
  readonly privacyPage: { readonly title: string; readonly updated: string; readonly intro: string };
  readonly termsPage: { readonly title: string; readonly updated: string; readonly intro: string };
  readonly blogPage: {
    readonly title: string;
    readonly subtitle: string;
    readonly categories: string;
    readonly allEntries: string;
    readonly philosophy: string;
    readonly analysis: string;
    readonly practical: string;
    readonly newestFirst: string;
    readonly readTime: string;
    readonly older: string;
    readonly newer: string;
    readonly backToAll: string;
  };
}

export const EN: HomeTranslations = {
  nav: {
    features: "Features",
    pricing: "Pricing",
    about: "About",
    blog: "Blog",
    tryDemo: "Try Demo",
    getStarted: "Get Started",
  },
  hero: {
    badge: "AI-Powered Teaching Assistant",
    titleLine1: "From rubrics to exams",
    titleLine2: "in 3 minutes.",
    subtitle:
      "The AI co-pilot for AP teachers. Generate rubrics, worksheets, and exams with a single conversation.",
    ctaPrimary: "Try Interactive Demo",
    ctaSecondary: "See How It Works",
    trustLine: "Trusted by 2,000+ AP teachers worldwide",
  },
  social: {
    stats: [
      { value: "2,000+", label: "AP Teachers" },
      { value: "50,000+", label: "Documents Created" },
      { value: "98%", label: "Time Saved" },
      { value: "4.9/5", label: "Teacher Rating" },
    ],
    trustedBy: "Trusted by educators at",
  },
  features: {
    titleLine1: "Everything you need,",
    titleLine2: "nothing you don't.",
    subtitle:
      "Four powerful tools in one seamless workflow. From initial rubric to final exam, Deskmate handles the heavy lifting.",
    items: [
      {
        title: "AI Rubric Generation",
        description:
          "Describe your assessment criteria in plain language. Get a structured, standards-aligned rubric in seconds — complete with point allocations and performance levels.",
      },
      {
        title: "Smart Worksheet Builder",
        description:
          "Generate differentiated worksheets with scaffolded questions. Supports multiple difficulty levels and automatically aligns to AP curriculum standards.",
      },
      {
        title: "Exam Assembly",
        description:
          "Build complete practice exams with balanced coverage. Multiple choice, free response, and constructed response — all formatted to match the real AP exam.",
      },
      {
        title: "One-Click Export",
        description:
          "Export polished, print-ready documents in PDF, DOCX, or directly to your LMS. Beautiful formatting with zero manual adjustments.",
      },
    ],
  },
  howItWorks: {
    title: "Simple as a conversation.",
    subtitle: "No learning curve. No templates to fill out. Just describe what you need.",
    steps: [
      {
        title: "Describe your needs",
        description:
          "Tell the AI what you're teaching — subject, unit, difficulty level, and any specific requirements. Just chat naturally.",
      },
      {
        title: "AI generates instantly",
        description:
          "Watch as Deskmate creates your rubric, worksheet, or exam in real-time. Review, edit, and refine with follow-up prompts.",
      },
      {
        title: "Export & distribute",
        description:
          "Download polished PDFs or export directly to Google Classroom. Print-ready formatting, every time.",
      },
    ],
  },
  subjects: {
    title: "Every AP subject, covered.",
    subtitle:
      "Aligned with College Board standards across all major AP courses. More subjects added regularly.",
  },
  testimonials: {
    title: "Loved by AP teachers.",
    subtitle: "Join thousands of educators who've transformed their workflow.",
    items: [
      {
        quote:
          "Deskmate cut my exam prep time from 4 hours to 15 minutes. The rubrics are more consistent than what I used to create manually.",
        author: "Sarah Chen",
        role: "AP Calculus Teacher",
        school: "Lincoln High School",
      },
      {
        quote:
          "My students' performance improved 23% after I started using Deskmate-generated practice exams. The question quality is remarkable.",
        author: "Michael Torres",
        role: "AP Physics Teacher",
        school: "Westfield Academy",
      },
      {
        quote:
          "Finally, an AI tool that understands AP standards. The worksheets are differentiated perfectly for my mixed-ability classes.",
        author: "Priya Sharma",
        role: "AP CS Principles",
        school: "Oakwood Prep",
      },
    ],
  },
  cta: {
    title: "Ready to save hours\nevery week?",
    subtitle:
      "Join the waitlist and be the first to experience AI-powered teaching preparation.",
    placeholder: "Enter your school email",
    button: "Join Waitlist",
    success: "You're on the list! We'll be in touch soon.",
    note: "Free for early adopters · No credit card required",
  },
  footer: {
    description: "The AI co-pilot for AP teachers. From rubrics to exams in 3 minutes.",
    product: "Product",
    resources: "Resources",
    company: "Company",
    privacy: "Privacy",
    terms: "Terms",
    copyright: "Deskmate. All rights reserved.",
    contact: "Contact",
  },
  pricing: {
    title: "Simple, transparent pricing.",
    subtitle: "Start free. Upgrade when you're ready. No surprises.",
    monthly: "Monthly",
    yearly: "Yearly",
    discount: "-20%",
    popular: "Most Popular",
    forever: "forever",
    perMonth: "/ month",
    billedYearly: "/ mo, billed yearly",
    faqTitle: "Frequently asked questions",
    plans: [
      {
        name: "Starter",
        description: "Perfect for individual teachers getting started.",
        cta: "Get Started Free",
        features: [
          { text: "5 documents per month", included: true },
          { text: "Basic rubric generation", included: true },
          { text: "Worksheet builder", included: true },
          { text: "PDF export", included: true },
          { text: "Email support", included: true },
          { text: "Exam assembly", included: false },
          { text: "Custom templates", included: false },
          { text: "Priority support", included: false },
        ],
      },
      {
        name: "Professional",
        description: "For teachers who need the full toolkit.",
        cta: "Start Free Trial",
        features: [
          { text: "Unlimited documents", included: true },
          { text: "Advanced rubric generation", included: true },
          { text: "Smart worksheet builder", included: true },
          { text: "PDF & DOCX export", included: true },
          { text: "Priority email support", included: true },
          { text: "Full exam assembly", included: true },
          { text: "Custom templates", included: true },
          { text: "LMS integration", included: false },
        ],
      },
      {
        name: "Department",
        description: "For school departments and teams.",
        cta: "Contact Sales",
        features: [
          { text: "Everything in Professional", included: true },
          { text: "Up to 20 teacher seats", included: true },
          { text: "Shared template library", included: true },
          { text: "Admin dashboard", included: true },
          { text: "LMS integration", included: true },
          { text: "Dedicated account manager", included: true },
          { text: "Custom onboarding", included: true },
          { text: "Phone support", included: true },
        ],
      },
    ],
    faq: [
      { q: "Is there really a free plan?", a: "Yes! The Starter plan is completely free with no credit card required. You get 5 documents per month to try out Deskmate." },
      { q: "Can I switch plans at any time?", a: "Absolutely. Upgrade, downgrade, or cancel anytime. If you upgrade mid-cycle, we'll prorate the difference." },
      { q: "Do you offer discounts for schools?", a: "Yes, we offer volume discounts for school-wide deployments. Contact our sales team for a custom quote." },
      { q: "What payment methods do you accept?", a: "We accept all major credit cards, and we can arrange PO/invoice billing for Department plans." },
    ],
  },
  about: {
    badge: "Our Mission",
    titleLine1: "We're building the tools teachers actually want.",
    subtitle:
      "The classroom is moving faster than the software built to support it. We're here to close the gap — with AI that understands curriculum, respects teacher expertise, and saves real hours every week.",
    storyTitle: "Our Story",
    storyParagraphs: [
      "Deskmate didn't start in a boardroom. It started at a kitchen table, at 2 AM, surrounded by half-graded AP exams and a growing sense that there had to be a better way.",
      "We saw brilliant teachers burning out — not because they lacked passion, but because the administrative weight of rubric creation, worksheet formatting, and exam assembly was crushing their time for actual teaching.",
      "Our first prototype was just a better way to generate a rubric. But teachers told us they wanted more. So we built more — always listening, always iterating, always putting the classroom first.",
    ],
    valuesTitle: "What we believe.",
    valuesSubtitle: "Our core principles guide every line of code we write and every feature we ship.",
    values: [
      { title: "Output quality first", description: "Every generated rubric, worksheet, and exam is aligned to College Board standards. We'd rather produce less content than compromise on accuracy." },
      { title: "Teacher time is sacred", description: "If a feature doesn't save teachers at least 30 minutes per week, we don't ship it. Every interaction is optimized for speed and clarity." },
      { title: "Subject depth", description: "We don't do generic. Our AI understands the nuances of each AP subject — from Calculus proofs to APUSH DBQs to AP Bio experimental design." },
      { title: "Continuous iteration", description: "We ship weekly, listen daily, and treat every teacher feedback as a gift. The product you see today will be better tomorrow." },
    ],
    ctaTitle: "Ready to reclaim your desk?",
    ctaSubtitle: "Join 15,000+ educators who are reimagining their workflow with Deskmate.",
    ctaButton: "Get Started Today",
  },
  privacyPage: {
    title: "Privacy Policy",
    updated: "Last updated: February 1, 2026",
    intro: "At Deskmate, we take your privacy seriously. This policy explains how we collect, use, and protect your personal information when you use our platform.",
  },
  termsPage: {
    title: "Terms of Service",
    updated: "Last updated: February 1, 2026",
    intro: "Please read these Terms of Service carefully before using Deskmate. These terms govern your access to and use of the platform.",
  },
  blogPage: {
    title: "AI & Education",
    subtitle: "Research-backed perspectives on how artificial intelligence is reshaping the classroom, the teaching profession, and the future of learning.",
    categories: "Categories",
    allEntries: "All Articles",
    philosophy: "Perspective",
    analysis: "Research & Analysis",
    practical: "Practical Guide",
    newestFirst: "Newest First",
    readTime: "Read Time",
    older: "Older",
    newer: "Newer",
    backToAll: "Back to all articles",
  },
};

export const ZH: HomeTranslations = {
  nav: {
    features: "功能",
    pricing: "定价",
    about: "关于",
    blog: "博客",
    tryDemo: "试用演示",
    getStarted: "立即开始",
  },
  hero: {
    badge: "AI 驱动的教学助手",
    titleLine1: "从评分标准到考试",
    titleLine2: "仅需 3 分钟。",
    subtitle: "AP 教师的 AI 副驾驶。通过一次对话即可生成评分标准、练习题和考试。",
    ctaPrimary: "试用交互演示",
    ctaSecondary: "了解工作原理",
    trustLine: "全球 2,000+ AP 教师信赖",
  },
  social: {
    stats: [
      { value: "2,000+", label: "AP 教师" },
      { value: "50,000+", label: "文档已生成" },
      { value: "98%", label: "时间节省" },
      { value: "4.9/5", label: "教师评分" },
    ],
    trustedBy: "受以下学校教师信赖",
  },
  features: {
    titleLine1: "你需要的一切，",
    titleLine2: "没有多余的。",
    subtitle: "四个强大工具融于一个无缝工作流。从初始评分标准到最终考试，Deskmate 帮你完成繁重工作。",
    items: [
      {
        title: "AI 评分标准生成",
        description: "用自然语言描述你的评估标准。几秒钟内获得结构化的、符合标准的评分标准——包含分值分配和表现等级。",
      },
      {
        title: "智能练习题构建器",
        description: "生成带有分层问题的差异化练习题。支持多个难度级别，自动对齐 AP 课程标准。",
      },
      {
        title: "考试组装",
        description: "构建覆盖面均衡的完整模拟考试。选择题、自由作答和简答题——格式与真实 AP 考试一致。",
      },
      {
        title: "一键导出",
        description: "导出精美的、可直接打印的 PDF、DOCX 文档，或直接导入你的 LMS。零手动调整。",
      },
    ],
  },
  howItWorks: {
    title: "简单如对话。",
    subtitle: "没有学习曲线。没有模板要填。只需描述你需要什么。",
    steps: [
      {
        title: "描述你的需求",
        description: "告诉 AI 你在教什么——学科、单元、难度级别和任何特定要求。像聊天一样自然。",
      },
      {
        title: "AI 即时生成",
        description: "看 Deskmate 实时创建你的评分标准、练习题或考试。通过后续提示进行审查、编辑和完善。",
      },
      {
        title: "导出和分发",
        description: "下载精美的 PDF 或直接导出到 Google Classroom。每次都是可打印的格式。",
      },
    ],
  },
  subjects: {
    title: "覆盖所有 AP 科目。",
    subtitle: "与所有主要 AP 课程的 College Board 标准对齐。更多科目持续添加中。",
  },
  testimonials: {
    title: "深受 AP 教师喜爱。",
    subtitle: "加入数千名已经转变工作流程的教育工作者。",
    items: [
      {
        quote: "Deskmate 将我的考试准备时间从 4 小时缩短到 15 分钟。评分标准比我手动创建的更加一致。",
        author: "Sarah Chen",
        role: "AP 微积分教师",
        school: "Lincoln 高中",
      },
      {
        quote: "自从我开始使用 Deskmate 生成的模拟考试后，学生的成绩提高了 23%。题目质量非常出色。",
        author: "Michael Torres",
        role: "AP 物理教师",
        school: "Westfield 学院",
      },
      {
        quote: "终于有一个理解 AP 标准的 AI 工具了。练习题完美地针对我的混合能力班级进行了差异化处理。",
        author: "Priya Sharma",
        role: "AP 计算机科学原理",
        school: "Oakwood 预科",
      },
    ],
  },
  cta: {
    title: "准备好每周\n节省数小时了吗？",
    subtitle: "加入等候名单，率先体验 AI 驱动的教学备课。",
    placeholder: "输入你的学校邮箱",
    button: "加入等候名单",
    success: "你已加入名单！我们会尽快联系你。",
    note: "早期用户免费 · 无需信用卡",
  },
  footer: {
    description: "AP 教师的 AI 副驾驶。从评分标准到考试仅需 3 分钟。",
    product: "产品",
    resources: "资源",
    company: "公司",
    privacy: "隐私",
    terms: "条款",
    copyright: "Deskmate. 保留所有权利。",
    contact: "联系我们",
  },
  pricing: {
    title: "简单透明的定价。",
    subtitle: "免费开始。准备好了再升级。没有意外。",
    monthly: "月付",
    yearly: "年付",
    discount: "-20%",
    popular: "最受欢迎",
    forever: "永久免费",
    perMonth: "/ 月",
    billedYearly: "/ 月，按年计费",
    faqTitle: "常见问题",
    plans: [
      {
        name: "入门版",
        description: "适合刚开始使用的个人教师。",
        cta: "免费开始",
        features: [
          { text: "每月 5 份文档", included: true },
          { text: "基础评分标准生成", included: true },
          { text: "练习题构建器", included: true },
          { text: "PDF 导出", included: true },
          { text: "邮件支持", included: true },
          { text: "考试组装", included: false },
          { text: "自定义模板", included: false },
          { text: "优先支持", included: false },
        ],
      },
      {
        name: "专业版",
        description: "适合需要完整工具包的教师。",
        cta: "开始免费试用",
        features: [
          { text: "无限文档", included: true },
          { text: "高级评分标准生成", included: true },
          { text: "智能练习题构建器", included: true },
          { text: "PDF 和 DOCX 导出", included: true },
          { text: "优先邮件支持", included: true },
          { text: "完整考试组装", included: true },
          { text: "自定义模板", included: true },
          { text: "LMS 集成", included: false },
        ],
      },
      {
        name: "部门版",
        description: "适合学校部门和团队。",
        cta: "联系销售",
        features: [
          { text: "专业版全部功能", included: true },
          { text: "最多 20 个教师席位", included: true },
          { text: "共享模板库", included: true },
          { text: "管理员仪表盘", included: true },
          { text: "LMS 集成", included: true },
          { text: "专属客户经理", included: true },
          { text: "定制入职培训", included: true },
          { text: "电话支持", included: true },
        ],
      },
    ],
    faq: [
      { q: "真的有免费计划吗？", a: "是的！入门版完全免费，不需要信用卡。你每月可以获得 5 份文档来试用 Deskmate。" },
      { q: "可以随时切换计划吗？", a: "当然可以。随时升级、降级或取消。如果你在计费周期中间升级，我们会按比例计算差价。" },
      { q: "你们提供学校折扣吗？", a: "是的，我们为全校部署提供批量折扣。请联系我们的销售团队获取定制报价。" },
      { q: "接受哪些支付方式？", a: "我们接受所有主要信用卡，部门版可以安排采购订单/发票付款。" },
    ],
  },
  about: {
    badge: "我们的使命",
    titleLine1: "我们在构建教师真正想要的工具。",
    subtitle:
      "课堂的发展速度已经超过了支撑它的软件。我们要弥合这个差距——用理解课程、尊重教师专业知识、每周节省真实时间的 AI。",
    storyTitle: "我们的故事",
    storyParagraphs: [
      "Deskmate 不是在会议室里诞生的。它始于凌晨 2 点的厨房桌上，周围散落着批了一半的 AP 试卷，以及一种越来越强烈的直觉——一定有更好的方式。",
      "我们看到优秀的教师在倦怠——不是因为缺乏热情，而是因为评分标准创建、练习题排版、考试组装的行政负担，挤压了他们真正用于教学的时间。",
      "我们的第一个原型只是一种更好的生成评分标准的方式。但教师们告诉我们他们想要更多。于是我们做了更多——始终倾听、始终迭代、始终把课堂放在第一位。",
    ],
    valuesTitle: "我们的信念。",
    valuesSubtitle: "我们的核心原则指导着我们写的每一行代码和发布的每一个功能。",
    values: [
      { title: "质量第一", description: "每份生成的评分标准、练习题和考试都与 College Board 标准对齐。我们宁可少产出内容，也不在准确性上妥协。" },
      { title: "教师时间神圣不可侵犯", description: "如果一个功能每周不能为教师节省至少 30 分钟，我们就不发布。每次交互都针对速度和清晰度进行优化。" },
      { title: "学科深度", description: "我们不做泛泛而谈。我们的 AI 理解每个 AP 学科的细微差别——从微积分证明到 APUSH DBQ 到 AP 生物实验设计。" },
      { title: "持续迭代", description: "我们每周发布、每天倾听，把每条教师反馈视为礼物。你今天看到的产品，明天会更好。" },
    ],
    ctaTitle: "准备好重新掌控你的办公桌了吗？",
    ctaSubtitle: "加入 15,000+ 正在用 Deskmate 重新定义工作流的教育工作者。",
    ctaButton: "立即开始",
  },
  privacyPage: {
    title: "隐私政策",
    updated: "最后更新：2026 年 2 月 1 日",
    intro: "在 Deskmate，我们非常重视你的隐私。本政策解释了当你使用我们的平台时，我们如何收集、使用和保护你的个人信息。",
  },
  termsPage: {
    title: "服务条款",
    updated: "最后更新：2026 年 2 月 1 日",
    intro: "在使用 Deskmate 之前，请仔细阅读这些服务条款。这些条款管理你对平台的访问和使用。",
  },
  blogPage: {
    title: "AI 与教育",
    subtitle: "以研究为基础，探讨人工智能如何重塑课堂、教学职业与学习的未来。",
    categories: "分类",
    allEntries: "全部文章",
    philosophy: "观点",
    analysis: "研究与分析",
    practical: "实用指南",
    newestFirst: "最新优先",
    readTime: "阅读时间",
    older: "更早",
    newer: "更新",
    backToAll: "返回所有文章",
  },
};
