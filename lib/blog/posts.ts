export type Category = "all" | "philosophy" | "analysis" | "practical";

export interface Author {
  readonly name: string;
  readonly initials: string;
  readonly role: string;
  readonly bio: string;
}

export interface Tag {
  readonly label: string;
  readonly colorClass: string;
}

export interface Section {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
}

export interface BlogPost {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly coverImage: string;
  readonly category: Category;
  readonly readTime: string;
  readonly date: string;
  readonly author: Author;
  readonly lead: string;
  readonly sections: readonly Section[];
  readonly pullQuote: string;
  readonly pullQuoteAfter: number;
  readonly tags: readonly Tag[];
}

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------

const AUTHOR_EN: Author = {
  name: "Martin & Claude Opus 4.6",
  initials: "MC",
  role: "Education & AI Research",
  bio: "Martin is the founder of Deskmate. These articles were co-written with Claude Opus 4.6, exploring the intersection of artificial intelligence and classroom practice through deep research and genuine dialogue.",
};

const AUTHOR_ZH: Author = {
  name: "Martin & Claude Opus 4.6",
  initials: "MC",
  role: "教育与 AI 研究",
  bio: "Martin 是 Deskmate 的创始人。这些文章由他与 Claude Opus 4.6 共同撰写，通过深度研究与真诚对话，探索人工智能与课堂实践的交汇点。",
};

// ---------------------------------------------------------------------------
// Tag palette (reused across posts)
// ---------------------------------------------------------------------------

const TAG = {
  ai: { label: "AI in Education", colorClass: "bg-[rgba(94,106,210,0.08)] text-[#5E6AD2]" },
  teaching: { label: "Teaching", colorClass: "bg-[rgba(234,228,242,0.5)] text-[#9065B0]" },
  assessment: { label: "Assessment", colorClass: "bg-[rgba(219,237,219,0.5)] text-[#2e7d32]" },
  pedagogy: { label: "Pedagogy", colorClass: "bg-[rgba(0,0,0,0.06)] text-[#1D1D1F]" },
  research: { label: "Research", colorClass: "bg-[rgba(94,106,210,0.08)] text-[#5E6AD2]" },
  pd: { label: "Professional Development", colorClass: "bg-[rgba(234,228,242,0.5)] text-[#9065B0]" },
  future: { label: "Future of Education", colorClass: "bg-[rgba(219,237,219,0.5)] text-[#2e7d32]" },
} as const;

const TAG_ZH = {
  ai: { label: "AI 教育", colorClass: TAG.ai.colorClass },
  teaching: { label: "教学", colorClass: TAG.teaching.colorClass },
  assessment: { label: "教学评估", colorClass: TAG.assessment.colorClass },
  pedagogy: { label: "教学法", colorClass: TAG.pedagogy.colorClass },
  research: { label: "研究", colorClass: TAG.research.colorClass },
  pd: { label: "教师发展", colorClass: TAG.pd.colorClass },
  future: { label: "教育未来", colorClass: TAG.future.colorClass },
} as const;

// ---------------------------------------------------------------------------
// ARTICLE 1 — The Last Lecture
// ---------------------------------------------------------------------------

const POST_1_EN: BlogPost = {
  slug: "the-last-lecture",
  title: "The Last Lecture: Teaching in the Age of Infinite Answers",
  excerpt:
    "When students can get polished explanations from AI at 2 AM, what is a teacher actually for? The answer is more hopeful — and more radical — than you might expect.",
  coverImage: "/blog/cover-the-last-lecture.svg",
  category: "philosophy",
  readTime: "10 min",
  date: "Mar 18, 2026",
  author: AUTHOR_EN,
  lead: "In the spring of 2024, a veteran AP History teacher in suburban Boston did something she had never done in 22 years of teaching: she walked into her classroom without a lecture prepared. Not because she had forgotten — but because she had spent the weekend watching her students get better explanations of the Compromise of 1850 from ChatGPT than she had ever given in two decades of instruction. The question that kept her up that night was not \"How do I compete with this?\" It was far more unsettling: \"What am I actually here for?\"",
  sections: [
    {
      id: "information-myth",
      title: "The Information Delivery Myth",
      paragraphs: [
        "The model of education that most of us experienced — and that most teachers were trained for — is fundamentally an information delivery system. A teacher stands at the front, possessing knowledge that students lack, and transfers it. This model made perfect sense when textbooks were expensive, libraries were far away, and expertise was scarce.",
        "But the model was already showing cracks long before AI arrived. The internet democratized information access two decades ago. Google made every fact retrievable in seconds. Wikipedia offered reasonable summaries of nearly any topic. Yet the lecture model persisted, because information access is not the same as information delivery — students still needed someone to curate, sequence, and explain.",
        "AI changes this equation fundamentally. Large language models do not just retrieve information; they explain, contextualize, and adapt to the learner's level. They answer follow-up questions without impatience. They are available at 2 AM the night before the exam. For the first time, the explanation function of teaching has genuine competition.",
      ],
    },
    {
      id: "atm-lesson",
      title: "What the ATM Didn't Kill",
      paragraphs: [
        "In 1970, there were roughly 300,000 bank tellers in the United States. The ATM was introduced widely in the late 1970s, and many predicted the end of the bank teller. By 2010, there were over 600,000. What happened?",
        "ATMs automated the transactional aspects of the job — deposits, withdrawals, balance checks. This made it cheaper to operate bank branches, so banks opened more of them. The tellers who remained shifted from transaction processing to relationship building: helping customers with complex products, offering financial advice, building trust.",
        "The parallel to teaching is instructive. AI automates the transactional parts of education: information delivery, routine practice, basic Q&A, and even initial assessment. But this does not eliminate the teacher — it eliminates the least valuable part of the teacher's current job and creates space for the most valuable parts to expand.",
      ],
    },
    {
      id: "human-core",
      title: "The Irreducible Human Core",
      paragraphs: [
        "Research consistently shows that the most impactful elements of teaching are deeply human. The Rosenthal effect demonstrated that teacher expectations physically alter student performance. Cornelius-White's meta-analysis of 119 studies found that teacher-student relationships accounted for more variance in student outcomes than any instructional method. Hattie's visible learning research ranks teacher credibility, collective teacher efficacy, and teacher-student relationships among the top influences on achievement — all fundamentally human factors.",
        "These are not things AI can replicate. A large language model can explain the Krebs cycle with perfect clarity. It cannot notice that a student who was engaged last week is now withdrawn. It cannot connect a struggling student's essay about immigration to her family's own recent experience. It cannot model intellectual humility by saying \"I was wrong about this, and here is how I changed my mind.\"",
        "The irreducible core of teaching is relational, emotional, and deeply contextual — precisely the dimensions that AI cannot touch.",
      ],
    },
    {
      id: "new-identity",
      title: "The New Teacher Identity",
      paragraphs: [
        "If AI handles information delivery, the teacher's role shifts dramatically. From lecturer to learning architect — designing experiences, not presentations. From answer-provider to question-designer — creating problems that demand synthesis, creativity, and judgment. From assessor to coach — providing real-time feedback on thinking processes. From content expert to thinking partner — modeling how an expert approaches unfamiliar problems.",
        "This shift is not about adding AI tools to existing practices. It requires a fundamental reimagining of what it means to be a teacher. The teachers who will thrive are not the ones who learn to use ChatGPT in their classrooms — they are the ones who embrace a professional identity built around the things AI cannot do.",
        "That AP History teacher in Boston? She went back to class on Monday with something better than a lecture. She gave her students a problem: \"ChatGPT says the Compromise of 1850 'temporarily preserved the Union.' In what sense is that a misleading simplification? Use primary sources to construct a more nuanced narrative.\" The ensuing discussion, she later told a colleague, was the best class she had had in years. She had not been replaced. She had been liberated.",
      ],
    },
  ],
  pullQuote:
    "The question is not whether AI will change teaching. The question is whether we will let it change teaching for the better — by freeing teachers to do what only humans can — or for the worse, by replacing human teachers with cheaper machines.",
  pullQuoteAfter: 2,
  tags: [TAG.ai, TAG.teaching, TAG.future],
};

const POST_1_ZH: BlogPost = {
  slug: "the-last-lecture",
  title: "最后一堂课：当 AI 能回答一切，教师何为？",
  excerpt:
    "当学生凌晨两点就能从 AI 获得精彩的讲解时，教师存在的意义是什么？答案比你想象的更令人振奋，也更加深刻。",
  coverImage: "/blog/cover-the-last-lecture.svg",
  category: "philosophy",
  readTime: "10 分钟",
  date: "2026年3月18日",
  author: AUTHOR_ZH,
  lead: "2024 年春天，波士顿郊区一位有着 22 年教龄的 AP 历史教师做了一件她从未做过的事：没有准备讲义就走进了教室。不是因为忘了——而是因为她花了整个周末看学生用 ChatGPT 获取关于「1850 年妥协案」的讲解，质量比她二十年来任何一次课堂讲授都要好。那天夜里让她辗转难眠的问题不是「我怎么跟 AI 竞争？」，而是一个更令人不安的问题：「我到底是来做什么的？」",
  sections: [
    {
      id: "information-myth",
      title: "知识传递的神话",
      paragraphs: [
        "我们大多数人经历过的教育模式——也是大多数教师被培训去执行的模式——本质上是一个信息传递系统。教师站在讲台前，把学生缺乏的知识传递给他们。在教科书昂贵、图书馆遥远、专业知识稀缺的年代，这个模式完全合理。",
        "但远在 AI 出现之前，这个模式就已经出现裂痕。互联网在二十年前就实现了信息的民主化。Google 让每一个事实都能在几秒内检索到。维基百科提供了几乎任何主题的合理概述。然而讲授模式依然存续，因为「获取信息」和「被讲授信息」是不同的——学生仍然需要有人来筛选、排序和讲解。",
        "AI 从根本上改变了这个等式。大语言模型不只是检索信息，它们能讲解、提供语境、并根据学习者的水平进行调整。它们能不厌其烦地回答追问。它们在考试前夜的凌晨两点依然在线。教学中「讲解」这个功能，第一次遇到了真正的竞争对手。",
      ],
    },
    {
      id: "atm-lesson",
      title: "ATM 没有消灭的东西",
      paragraphs: [
        "1970 年，美国大约有 30 万名银行柜员。ATM 在 1970 年代末广泛推广后，很多人预言柜员将消亡。到 2010 年，美国银行柜员超过了 60 万。发生了什么？",
        "ATM 自动化了工作中的交易性环节——存款、取款、余额查询。这降低了运营银行网点的成本，所以银行反而开设了更多网点。留下来的柜员从处理交易转向了建立关系：帮助客户处理复杂业务、提供理财建议、建立信任。",
        "这对教育的启示非常清晰。AI 自动化的是教育中的「交易性」环节：知识传递、常规练习、基础答疑，甚至初步评估。但这并不会消灭教师——它消灭的是教师当前工作中最不具价值的部分，同时为最有价值的部分腾出了空间。",
      ],
    },
    {
      id: "human-core",
      title: "不可替代的人性内核",
      paragraphs: [
        "研究一再表明，教学中最具影响力的元素是深层次的人性因素。罗森塔尔效应证明，教师的期望会实质性地改变学生的表现。Cornelius-White 对 119 项研究的元分析发现，师生关系对学生成果的解释力超过了任何教学方法。Hattie 的可视化学习研究将教师信誉、教师集体效能感和师生关系列为影响学业成就的最重要因素——这些全都是根本性的人类因素。",
        "这些不是 AI 能复制的。大语言模型可以完美地讲解克雷布斯循环。但它无法注意到上周还很投入的学生这周变得沉默了。它无法将一个学生关于移民的文章与她家庭最近的亲身经历联系起来。它无法通过说「我之前理解错了，我是这样改变想法的」来示范知识上的谦逊。",
        "教学不可替代的核心是关系性的、情感性的、深度情境化的——恰恰是 AI 触及不到的维度。",
      ],
    },
    {
      id: "new-identity",
      title: "教师的新身份",
      paragraphs: [
        "如果 AI 接管了知识传递，教师的角色将发生根本性转变。从讲授者到学习体验设计师——设计经历，而非演示文稿。从答案提供者到问题设计师——创造需要综合分析、创造力和判断力的问题。从评估者到教练——对思维过程提供即时反馈。从学科专家到思维伙伴——示范一个专家如何应对陌生问题。",
        "这种转变不是在现有教学实践中「加入 AI 工具」那么简单。它需要对「教师意味着什么」进行根本性的重新想象。未来最成功的教师，不是那些学会在课堂上使用 ChatGPT 的人——而是那些拥抱了一种建立在「AI 做不到的事」之上的职业认同的人。",
        "波士顿那位 AP 历史教师？她周一回到课堂时，带来了比讲义更好的东西：一个问题。「ChatGPT 说 1850 年妥协案'暂时保住了联邦'。这在什么意义上是一种误导性的简化？请使用一手史料构建一个更细致的叙事。」随后的课堂讨论，她后来告诉同事，是她多年来最好的一堂课。她没有被取代。她被解放了。",
      ],
    },
  ],
  pullQuote:
    "问题不是 AI 是否会改变教学。问题是我们是否会让它往好的方向改变——释放教师去做只有人类能做的事——还是往坏的方向改变——用更便宜的机器取代人类教师。",
  pullQuoteAfter: 2,
  tags: [TAG_ZH.ai, TAG_ZH.teaching, TAG_ZH.future],
};

// ---------------------------------------------------------------------------
// ARTICLE 2 — The Homework Apocalypse
// ---------------------------------------------------------------------------

const POST_2_EN: BlogPost = {
  slug: "the-homework-apocalypse",
  title: "The Homework Apocalypse: How AI Revealed What Assessment Was Always Missing",
  excerpt:
    "The panic about students using ChatGPT to cheat misses the point entirely. If a machine can do the assignment, what was the assignment really measuring?",
  coverImage: "/blog/cover-the-homework-apocalypse.svg",
  category: "analysis",
  readTime: "9 min",
  date: "Mar 10, 2026",
  author: AUTHOR_EN,
  lead: "The panic started in late 2022. Teachers across the country discovered that students could paste their homework assignments into ChatGPT and receive polished, competent responses in seconds. English essays, history analyses, coding assignments, science explanations — suddenly, the backbone of academic assessment felt fragile. Schools scrambled: AI detectors were purchased, honor codes were rewritten, some institutions banned laptops from classrooms entirely. But in the rush to defend the old system, almost nobody asked the more important question: if a machine can do the assignment, what was the assignment actually measuring?",
  sections: [
    {
      id: "blooms-problem",
      title: "The Bloom's Taxonomy Problem",
      paragraphs: [
        "In 1956, educational psychologist Benjamin Bloom proposed a hierarchy of cognitive skills: Remember, Understand, Apply, Analyze, Evaluate, Create. Examine most homework assignments — even at the AP level — through this lens, and an uncomfortable truth emerges: the vast majority sit at the Remember and Understand levels. Summarize this chapter. Define these terms. Explain this concept.",
        "These are precisely the cognitive tasks that large language models perform best. When teachers say \"AI can do my homework,\" what they are really saying is: \"My homework was testing skills that machines now possess.\"",
        "This is not an indictment of individual teachers — the system has incentivized these assignments for decades. They are easy to create, easy to grade, and produce clean quantifiable data. But they were always measuring the least interesting cognitive skills. AI did not break assessment. AI held up a mirror.",
      ],
    },
    {
      id: "what-ai-cannot-do",
      title: "What AI Cannot Do (Yet)",
      paragraphs: [
        "While AI excels at lower-order cognitive tasks, significant gaps remain at the upper levels of Bloom's taxonomy. Consider what current AI cannot do well: authentic analysis that connects ideas to a student's personal experience, community context, and broader coursework; genuine evaluation that reflects the kind of informed judgment born from deep expertise in a specific situation; and original creation that embodies real personal insight rather than pattern recombination.",
        "The assignments that resist AI automation share common traits: they require personal context, demand process documentation, involve real-world application, or depend on interpersonal engagement. This gives educators a clear design principle for the post-AI assessment era.",
      ],
    },
    {
      id: "portfolio-revolution",
      title: "The Portfolio Revolution",
      paragraphs: [
        "Some of the most innovative responses to AI in education involve abandoning the traditional assignment-and-grade model entirely in favor of portfolio-based assessment. In one AP Literature program that piloted this approach during the 2023–2024 school year, students maintained semester-long \"thinking portfolios\" that included initial responses to texts written by hand in class, revision histories showing how their thinking evolved, recorded Socratic seminar contributions, self-reflections connecting texts to personal experience, and peer review exchanges.",
        "The teacher reported that not only was academic dishonesty eliminated as a concern, but the quality of student thinking improved measurably. \"When students know they will need to show their thinking process, they actually think,\" she observed. \"The old essay assignment incentivized producing a polished product. The portfolio incentivizes learning.\"",
      ],
    },
    {
      id: "formative-shift",
      title: "Formative Over Summative",
      paragraphs: [
        "Perhaps the most significant shift AI enables is from summative assessment — testing what students learned after the fact — to formative assessment — supporting learning as it happens. Research is unequivocal on this point: formative assessment is dramatically more effective. Black and Wiliam's seminal 1998 meta-analysis found that formative assessment produces learning gains equivalent to six to nine months of additional schooling.",
        "Yet summative assessment dominates education, largely because formative assessment is labor-intensive — it requires continuous, personalized feedback that no single teacher can provide to 150 students. AI changes the economics entirely. AI tutoring systems can provide immediate feedback on practice problems. AI writing assistants can offer revision suggestions in real time. AI analysis tools can identify knowledge gaps as they form, not after a unit test reveals them.",
        "The irony is striking: the same technology that \"broke\" summative homework may be the key to implementing the formative assessment practices that research has championed for decades. The homework apocalypse was not really an apocalypse. It was a forced evolution — the kind that happens when an external shock reveals latent fragility in a system. The assignments that AI can complete were always the weakest link in education's assessment chain. Now that the link has broken, we have an opportunity to build something stronger.",
      ],
    },
  ],
  pullQuote:
    "We spent months worrying about students using AI to write their essays. We should have spent that time asking why we were still assigning essays that AI could write.",
  pullQuoteAfter: 1,
  tags: [TAG.assessment, TAG.ai, TAG.pedagogy],
};

const POST_2_ZH: BlogPost = {
  slug: "the-homework-apocalypse",
  title: "作业末日：AI 如何揭示了教学评估一直缺失的东西",
  excerpt:
    "对学生用 ChatGPT「作弊」的恐慌完全搞错了重点。如果机器能完成这份作业，那这份作业到底在测量什么？",
  coverImage: "/blog/cover-the-homework-apocalypse.svg",
  category: "analysis",
  readTime: "9 分钟",
  date: "2026年3月10日",
  author: AUTHOR_ZH,
  lead: "恐慌始于 2022 年底。全国各地的教师发现，学生可以把作业题目粘贴到 ChatGPT 中，几秒钟内就能获得措辞流畅、内容完整的回答。英语论文、历史分析、编程作业、科学说明——突然之间，学术评估的基石感觉脆弱不堪。学校紧急应对：购买 AI 检测器，重写诚信守则，有的机构甚至禁止在教室使用笔记本电脑。但在急于捍卫旧体系的过程中，几乎没有人去问那个更重要的问题：如果机器能完成这份作业，那这份作业到底在测量什么？",
  sections: [
    {
      id: "blooms-problem",
      title: "布鲁姆分类学的尴尬",
      paragraphs: [
        "1956 年，教育心理学家本杰明·布鲁姆提出了一个认知技能层次模型：记忆、理解、应用、分析、评价、创造。用这个框架审视大多数作业——即使是 AP 级别的——一个令人不安的事实浮现出来：绝大多数作业停留在「记忆」和「理解」层面。概括这一章。定义这些术语。解释这个概念。",
        "而这恰恰是大语言模型最擅长的认知任务。当教师说「AI 能做我的作业」时，他们真正在说的是：「我的作业测试的是机器现在也拥有的能力。」",
        "这不是对个别教师的指控——整个系统几十年来一直在激励这类作业。它们容易出题、容易打分、能产生干净的量化数据。但它们一直在测量最不有趣的认知技能。AI 没有打破评估体系。AI 只是举起了一面镜子。",
      ],
    },
    {
      id: "what-ai-cannot-do",
      title: "AI 还做不到的事",
      paragraphs: [
        "虽然 AI 在低阶认知任务上表现出色，但在布鲁姆分类法的高阶层面仍有明显不足。思考一下当前 AI 做不好的事情：将分析与学生个人经历、社区背景和其他课程内容联系起来的真实分析能力；基于特定情境深度专业知识的真正评价判断；以及体现真正个人洞察而非模式重组的原创作品。",
        "那些能抵抗 AI 自动化的作业有共同特征：它们需要个人背景、要求过程记录、涉及真实世界应用、或依赖人际互动。这为教育者提供了后 AI 时代评估设计的清晰原则。",
      ],
    },
    {
      id: "portfolio-revolution",
      title: "学习档案的革命",
      paragraphs: [
        "一些最具创新性的应对方式是彻底放弃传统的「作业—打分」模式，转向基于学习档案（Portfolio）的评估。在一个 2023–2024 学年试点的 AP 文学项目中，学生维护了一整个学期的「思维档案」，包括课堂上手写的初始文本回应、展示思维演变过程的修改历史、苏格拉底式研讨的录音记录、将文本与个人经历联系起来的自我反思，以及同伴互评的交流记录。",
        "该教师报告说，学术诚信不仅不再是问题，学生的思维质量还出现了可测量的提升。「当学生知道他们需要展示思维过程时，他们就真的会思考，」她观察到。「旧的论文作业激励的是产出一个打磨好的成品。学习档案激励的是学习本身。」",
      ],
    },
    {
      id: "formative-shift",
      title: "从终结性评估到形成性评估",
      paragraphs: [
        "AI 推动的最重大转变，或许是从终结性评估（在学习结束后测试学生学到了什么）到形成性评估（在学习过程中提供支持）。研究对此的结论是明确的：形成性评估的效果远优于终结性评估。Black 和 Wiliam 1998 年的经典元分析发现，形成性评估产生的学习增益相当于额外六到九个月的在校学习。",
        "然而终结性评估依然主导着教育，主要原因是形成性评估太耗费人力——它要求持续的、个性化的反馈，没有哪个教师能独自为 150 名学生提供这些。AI 彻底改变了形成性评估的经济学。AI 辅导系统可以对练习题提供即时反馈。AI 写作助手可以实时提供修改建议。AI 分析工具可以在知识漏洞形成时就识别出来，而不是等到单元测试后才发现。",
        "这其中的讽刺意味深长：「打破」了终结性作业的同一种技术，可能正是实现研究者倡导了几十年的形成性评估实践的关键。作业末日并不是真正的末日。它是一次被迫的进化——当一个外部冲击暴露了系统中潜在的脆弱性时，就会发生这种进化。那些 AI 能完成的作业，一直是教育评估链条中最薄弱的一环。现在这个环节断裂了，我们有机会构建更坚固的东西。",
      ],
    },
  ],
  pullQuote:
    "我们花了几个月担心学生用 AI 写论文。我们本该把那些时间用来追问：为什么我们还在布置 AI 能写的论文？",
  pullQuoteAfter: 1,
  tags: [TAG_ZH.assessment, TAG_ZH.ai, TAG_ZH.pedagogy],
};

// ---------------------------------------------------------------------------
// ARTICLE 3 — The Two-Sigma Trap
// ---------------------------------------------------------------------------

const POST_3_EN: BlogPost = {
  slug: "the-two-sigma-trap",
  title: "The Two-Sigma Trap: AI Tutoring and the Relationship It Can't Replicate",
  excerpt:
    "Bloom's famous finding showed tutoring produces dramatic gains. AI promises to deliver this at scale. But the research on why tutoring works points to something machines can't provide.",
  coverImage: "/blog/cover-the-two-sigma-trap.svg",
  category: "analysis",
  readTime: "11 min",
  date: "Feb 28, 2026",
  author: AUTHOR_EN,
  lead: "In 1984, educational psychologist Benjamin Bloom published a finding that would haunt education for four decades. Students who received one-on-one tutoring performed two standard deviations better than students in conventional classrooms — the \"2 sigma\" effect. In practical terms, the average tutored student outperformed 98% of students in a traditional class. The implication was clear and devastating: we knew the solution to educational inequality. We just could not afford it. Now, four decades later, AI seems to offer the answer — an infinitely patient, always available, endlessly knowledgeable tutor in every student's pocket. The 2-sigma problem, finally solved. Except that when researchers examine why tutoring actually works, they find something that complicates the AI narrative considerably.",
  sections: [
    {
      id: "what-tutoring-is",
      title: "What Tutoring Actually Is",
      paragraphs: [
        "When most people imagine tutoring, they picture content delivery: a knowledgeable adult explaining concepts one-on-one, adjusting pace and difficulty to match the student's level. AI does this remarkably well. But research on effective tutoring reveals something more complex.",
        "Lepper and Woolverton's landmark 2002 study of expert tutors found that the most effective tutoring sessions were characterized not by superior explanations, but by superior relationships. Expert tutors spent significant time on non-content interactions: expressing genuine interest in the student's life, using humor, sharing their own learning struggles, and carefully calibrating emotional support.",
        "VanLehn's 2011 meta-analysis confirmed this pattern: human tutoring consistently outperformed computer tutoring, not in the quality of explanations — which were sometimes equivalent — but in what researchers called \"social scaffolding.\" Students tried harder, persisted longer, and took more intellectual risks with human tutors. Not because the content was better delivered, but because a relationship made the learning feel safe.",
      ],
    },
    {
      id: "belonging",
      title: "The Belonging Problem",
      paragraphs: [
        "The research on belonging in education is striking. Walton and Cohen's 2011 study showed that a brief belonging intervention — essentially helping students feel they were part of a community — closed the achievement gap between Black and white college students by 50% over three years. The mechanism was not cognitive. It was social and emotional.",
        "Students who feel they belong approach academic challenges differently: with persistence rather than threat, curiosity rather than anxiety. A large language model cannot create belonging. It can simulate warmth and use encouraging language. But it cannot make a student feel genuinely seen by another person.",
        "This matters because learning is not purely cognitive — it is profoundly social. We learn in relationship, and the quality of that relationship determines the depth of the learning.",
      ],
    },
    {
      id: "personalization-paradox",
      title: "The Paradox of Personalization",
      paragraphs: [
        "Here is the uncomfortable paradox: the more we personalize education through AI, the more we risk isolating learners from the social context that makes learning powerful.",
        "Consider the typical AI tutoring scenario — a student alone with a screen, receiving individually tailored content at an individually optimized pace. This is excellent for certain types of skill building: vocabulary acquisition, math fact fluency, procedural knowledge. But it removes three elements that research identifies as critical to deep learning.",
        "First, peer interaction — Vygotsky's zone of proximal development depends on social engagement with more capable peers. Second, productive struggle in community — watching classmates wrestle with the same problem normalizes difficulty and builds resilience. Third, identity formation — students develop academic identities through social mirrors, seeing themselves reflected in teachers and peers who value intellectual growth.",
        "The most effective use of AI tutoring, then, is not as a replacement for human instruction but as a complement — handling the skill building that benefits from individualization while freeing human time for the relational, communal aspects of learning that benefit from togetherness.",
      ],
    },
    {
      id: "real-solution",
      title: "The Real Two-Sigma Solution",
      paragraphs: [
        "If AI can deliver the content-individualization component of tutoring, and human teachers can deliver the relational component, the real 2-sigma solution might look like this: AI handles differentiated practice, immediate feedback, and content remediation — the tasks where infinite patience and around-the-clock availability genuinely help. Teachers, freed from these tasks, invest their time in Socratic dialogue, mentorship, community building, and modeling expert thinking in real time.",
        "This is not a compromise. This is potentially better than pure one-on-one tutoring, because it combines the personalization that AI provides with the communal learning that a classroom of peers enables — something even the best private tutor cannot replicate.",
        "The 2-sigma trap is believing that the sigma comes from personalization alone. It does not. It comes from personalization embedded in relationship. The challenge for educators is not to choose between AI and human teaching, but to architect systems where each does what it does best — and where no student is left alone with a screen when what they need is a person.",
      ],
    },
  ],
  pullQuote:
    "Bloom's 2-sigma problem was never really about content delivery. It was about what happens when a caring adult pays close attention to a single learner's mind. AI can simulate the first part. It cannot simulate the second.",
  pullQuoteAfter: 1,
  tags: [TAG.research, TAG.ai, TAG.pedagogy],
};

const POST_3_ZH: BlogPost = {
  slug: "the-two-sigma-trap",
  title: "两个标准差的陷阱：AI 辅导无法复制的那层关系",
  excerpt:
    "布鲁姆的经典研究表明一对一辅导能产生惊人的学习提升。AI 承诺将这种效果规模化。但关于辅导为何有效的研究，指向了机器无法提供的东西。",
  coverImage: "/blog/cover-the-two-sigma-trap.svg",
  category: "analysis",
  readTime: "11 分钟",
  date: "2026年2月28日",
  author: AUTHOR_ZH,
  lead: "1984 年，教育心理学家本杰明·布鲁姆发表了一项将困扰教育界四十年的研究发现：接受一对一辅导的学生比传统课堂学生的表现高出两个标准差——即「2σ 效应」。用通俗的话说，接受辅导的普通学生能超过传统课堂中 98% 的学生。其含义既清晰又令人沮丧：我们知道解决教育不平等的方案是什么，只是负担不起。四十年后的今天，AI 似乎给出了答案——一个无限耐心、随时在线、无所不知的辅导教师，装在每个学生的口袋里。2σ 问题，终于解决了。然而，当研究者深入考察辅导为何真正有效时，他们发现的东西让 AI 的叙事变得复杂了许多。",
  sections: [
    {
      id: "what-tutoring-is",
      title: "辅导到底是什么",
      paragraphs: [
        "大多数人想象中的辅导是内容传递：一个知识渊博的成年人一对一地讲解概念，根据学生的水平调整节奏和难度。AI 在这方面做得非常好。但关于有效辅导的研究揭示了更复杂的内涵。",
        "Lepper 和 Woolverton 2002 年对专家级辅导教师的里程碑式研究发现，最有效的辅导不是靠更好的讲解，而是靠更好的关系。专家级辅导教师花了大量时间在非学科内容互动上：对学生的生活表达真诚兴趣、使用幽默、分享自己的学习挫折、细心调校情感支持。",
        "VanLehn 2011 年的元分析证实了这一模式：人类辅导始终优于计算机辅导，不是在讲解质量上——有时候两者相当——而是在研究者所称的「社会支架」上。学生在人类辅导教师面前更努力、更坚持、更愿意承担智识风险。不是因为内容讲得更好，而是因为关系让学习变得安全。",
      ],
    },
    {
      id: "belonging",
      title: "归属感问题",
      paragraphs: [
        "关于教育中归属感的研究令人瞩目。Walton 和 Cohen 2011 年的研究表明，一个简短的归属感干预——本质上是帮助学生感到自己是社区的一部分——在三年内将黑人和白人大学生之间的成绩差距缩小了 50%。起作用的机制不是认知性的，而是社会性和情感性的。",
        "感到归属的学生面对学业挑战时，表现出的是坚持而非恐惧，好奇而非焦虑。大语言模型无法创造归属感。它可以模拟温暖，可以使用鼓励性的语言。但它无法让一个学生感到被另一个人真正地「看见」。",
        "这很重要，因为学习不是纯粹的认知活动——它是深刻的社会活动。我们在关系中学习，而关系的质量决定了学习的深度。",
      ],
    },
    {
      id: "personalization-paradox",
      title: "个性化的悖论",
      paragraphs: [
        "这里有一个令人不安的悖论：我们越是通过 AI 来个性化教育，就越可能将学习者与使学习产生力量的社会环境隔离开来。",
        "想想典型的 AI 辅导场景——一个学生独自面对屏幕，以个性化定制的内容和个性化优化的节奏学习。这对某些类型的技能培养非常出色：词汇积累、数学运算流畅性、程序性知识。但它移除了研究认为对深度学习至关重要的三个要素。",
        "第一，同伴互动——维果茨基的最近发展区理论依赖于与更有能力的同伴的社会性参与。第二，在集体中进行的有成效的挣扎——看到同学在同一个问题上苦苦思索，让困难变得正常化，也构建了韧性。第三，身份形成——学生通过社会镜像来建立学术身份认同，在重视智识成长的教师和同伴身上看到自己的映射。",
        "因此，AI 辅导最有效的使用方式不是替代人类教学，而是作为补充——处理那些受益于个性化的技能训练，同时释放人类时间用于学习中那些受益于共同在场的关系性、社群性方面。",
      ],
    },
    {
      id: "real-solution",
      title: "真正的 2σ 解决方案",
      paragraphs: [
        "如果 AI 能提供辅导中的内容个性化部分，人类教师能提供关系部分，那么真正的 2σ 解决方案可能是这样的：AI 负责差异化练习、即时反馈和内容补救——这些是无限耐心和全天候可用性真正有帮助的任务。教师从这些任务中解放出来，将时间投入苏格拉底式对话、导师辅导、社群建设，以及实时示范专家思维。",
        "这不是妥协。这可能比纯粹的一对一辅导更好，因为它结合了 AI 提供的个性化和同伴课堂提供的社群学习——即便是最好的私人家教也无法兼得这两者。",
        "2σ 陷阱在于相信那个 σ 仅仅来自个性化。事实并非如此。它来自嵌入在关系中的个性化。教育者面临的挑战不是在 AI 和人类教学之间做选择，而是设计让两者各展所长的系统——确保没有任何学生在需要一个人的时候，只面对一块屏幕。",
      ],
    },
  ],
  pullQuote:
    "布鲁姆的 2σ 问题从来不只是关于内容传递。它的核心是：当一个有关怀的成年人全神贯注于一个学习者的思维时，会发生什么。AI 可以模拟前半部分，但无法模拟后半部分。",
  pullQuoteAfter: 1,
  tags: [TAG_ZH.research, TAG_ZH.ai, TAG_ZH.pedagogy],
};

// ---------------------------------------------------------------------------
// ARTICLE 4 — Beyond Prompt Engineering
// ---------------------------------------------------------------------------

const POST_4_EN: BlogPost = {
  slug: "beyond-prompt-engineering",
  title: "Beyond Prompt Engineering: The Five Competencies Educators Actually Need",
  excerpt:
    "Teaching teachers to use ChatGPT is like teaching someone to use a microwave and calling it culinary school. The real competencies go far deeper.",
  coverImage: "/blog/cover-beyond-prompt-engineering.svg",
  category: "practical",
  readTime: "12 min",
  date: "Feb 15, 2026",
  author: AUTHOR_EN,
  lead: "When school districts talk about \"AI professional development\" for teachers, what they usually mean is this: a half-day workshop where an instructional technology coordinator demonstrates how to use ChatGPT to generate quiz questions, draft lesson plans, and write parent emails. Teachers leave with a handful of prompt templates and a vague sense that they should be \"integrating AI\" into their practice. This is not AI literacy. This is tool training — the educational equivalent of teaching someone to use a microwave and calling it culinary school. The competencies that teachers actually need to thrive in the AI era go far deeper than knowing how to write a good prompt.",
  sections: [
    {
      id: "critical-evaluation",
      title: "Competency One: Critical Evaluation of AI Output",
      paragraphs: [
        "The most immediately urgent competency is the ability to evaluate AI-generated content for accuracy, bias, and pedagogical appropriateness. This sounds simple. It is not.",
        "Large language models produce outputs that are fluent, confident, and well-structured — regardless of whether they are accurate. This \"fluency trap\" is particularly dangerous in education, where teachers may rely on AI-generated materials without the subject expertise to spot errors. A math teacher using AI to generate AP Calculus problems might not notice a subtle error in a proof. A history teacher using AI to create document-based questions might miss an anachronistic claim presented with perfect confidence.",
        "Critical evaluation is not about using AI detectors or checking every fact. It is about developing what we might call \"productive skepticism\" — the habit of engaging with AI output as a draft to be interrogated rather than a product to be consumed. This means verifying claims against authoritative sources, identifying where AI reasoning sounds plausible but is actually circular, recognizing when AI is producing a median answer that lacks the nuance your specific curriculum demands, and testing AI-generated assessments against actual learning objectives.",
      ],
    },
    {
      id: "question-design",
      title: "Competency Two: Question Design in a Post-Answer World",
      paragraphs: [
        "When answers are free, questions become the scarce resource. The ability to design questions that provoke genuine thinking — questions that AI cannot trivially answer — is perhaps the most valuable pedagogical skill in the AI era.",
        "Consider the difference. A weak, AI-answerable question: \"What were the causes of World War I?\" A strong question that demands human thinking: \"Your great-grandmother lived in Sarajevo in 1914. Using primary sources, write her a letter explaining what you have learned about why her world fell apart. What would you want her to know that she could not have known then?\"",
        "The second question requires personal connection, empathy, source evaluation, and narrative construction — none of which AI can perform authentically. Training teachers in question design means moving them from \"What do students need to know?\" to \"What do students need to think about?\" This is a fundamental pedagogical shift that extends far beyond AI.",
      ],
    },
    {
      id: "process-pedagogy",
      title: "Competency Three: Process Pedagogy",
      paragraphs: [
        "When AI can produce polished final products instantly, the educational value shifts from product to process. Teachers need to become experts in what we might call \"process pedagogy\" — making the thinking process itself the object of learning.",
        "This means documenting student thinking through thinking journals, revision histories, and recorded discussions. It means teaching metacognitive strategies — how to plan, monitor, and evaluate one's own thinking. It means creating assignments where the process is the product: design logs, research narratives, learning reflections. And it means using AI as a \"thinking partner\" rather than a \"doing machine\" — asking students to critique AI outputs rather than accept them.",
        "Process pedagogy is not new — it has roots in writing process theory, constructivism, and project-based learning. But AI makes it urgent. When the product is trivially producible, only the process retains educational value.",
      ],
    },
    {
      id: "ethical-navigation",
      title: "Competency Four: Ethical Navigation",
      paragraphs: [
        "The ethical dimensions of AI in education are complex and evolving. When does using AI constitute academic dishonesty? How should attribution work when AI contributed to a student's work? What happens when AI perpetuates biases in educational content? How do we protect student privacy when using AI-powered tools?",
        "Teachers need frameworks for navigating these questions — not rigid rules, but ethical reasoning skills that can adapt as the technology evolves. Most importantly, teachers need to model ethical AI use for their students: being transparent about their own AI use, engaging honestly with tensions and uncertainties, and creating classroom cultures where ethical questions about technology are taken as seriously as the technology itself.",
      ],
    },
    {
      id: "augmented-workflow",
      title: "Competency Five: Augmented Workflow Architecture",
      paragraphs: [
        "The final competency is practical: knowing how to architect a workflow that strategically combines human and AI capabilities. This means identifying which tasks in the teaching workflow genuinely benefit from AI — content generation, differentiation, initial feedback — which tasks should remain entirely human — relationship building, complex assessment, sensitive communication — and which tasks should be hybrid, with AI generating a draft that the teacher refines with professional expertise.",
        "The teachers who thrive will not be the ones who use AI the most, nor the ones who avoid it entirely. They will be the ones who develop sophisticated judgment about when each approach is appropriate — and who are willing to revise that judgment as both the technology and their understanding of it continue to evolve.",
        "The conversation about AI and teaching has been dominated by tools — which AI to use, how to prompt it, how to detect it. This is understandable but insufficient. The deeper transformation is not about tools at all. It is about what it means to be an educator when knowledge is free, production is cheap, and the uniquely human elements of teaching — judgment, relationship, ethical reasoning, and the capacity to ask beautiful questions — become not just valuable, but essential.",
      ],
    },
  ],
  pullQuote:
    "The goal of AI professional development is not to create teachers who are good at using AI. It is to create teachers who are good at teaching in a world where AI exists — and that is a much bigger, more interesting challenge.",
  pullQuoteAfter: 2,
  tags: [TAG.pd, TAG.ai, TAG.teaching],
};

const POST_4_ZH: BlogPost = {
  slug: "beyond-prompt-engineering",
  title: "超越提示词工程：教育者真正需要的五项核心能力",
  excerpt:
    "教教师使用 ChatGPT，就像教人用微波炉然后说这是烹饪学校。真正需要的能力远比这深刻得多。",
  coverImage: "/blog/cover-beyond-prompt-engineering.svg",
  category: "practical",
  readTime: "12 分钟",
  date: "2026年2月15日",
  author: AUTHOR_ZH,
  lead: "当学区谈论教师的「AI 专业发展」时，他们通常指的是：半天的工作坊，一位教育技术协调员演示如何用 ChatGPT 生成测验题、起草教案、撰写家长邮件。教师们带着几个提示词模板和一种模糊的「我应该把 AI 融入教学」的感觉离开。这不是 AI 素养。这是工具培训——教育界版的「教人用微波炉，然后称之为烹饪学校」。教师要在 AI 时代真正蓬勃发展所需的能力，远比写好一个提示词要深刻得多。",
  sections: [
    {
      id: "critical-evaluation",
      title: "能力一：批判性评估 AI 输出",
      paragraphs: [
        "最紧迫的能力是评估 AI 生成内容的准确性、偏见和教学适用性。这听起来简单，实则不然。",
        "大语言模型产出的内容流畅、自信、结构清晰——无论它是否准确。这种「流畅性陷阱」在教育中尤其危险，因为教师可能会依赖 AI 生成的材料，却没有足够的学科专业知识来发现错误。用 AI 生成 AP 微积分题目的数学教师可能注意不到证明中的微妙错误。用 AI 创建文献分析题的历史教师可能会遗漏一个以完美自信呈现的时代错误。",
        "批判性评估不是使用 AI 检测器或逐一核查事实。它是培养一种我们可以称为「建设性怀疑」的习惯——把 AI 输出当作需要质询的草稿，而非可以直接消费的成品。这意味着将主张与权威来源核实，识别 AI 推理在哪里听起来合理但实际上是循环论证，辨别 AI 何时在产生缺乏你特定课程所需细微差别的「中位数答案」，并将 AI 生成的评估与实际学习目标进行测试。",
      ],
    },
    {
      id: "question-design",
      title: "能力二：后答案时代的问题设计",
      paragraphs: [
        "当答案免费时，问题就成了稀缺资源。设计能激发真正思考的问题——AI 无法轻易回答的问题——这或许是 AI 时代最有价值的教学技能。",
        "感受一下差异。一个弱问题（AI 可轻松回答）：「第一次世界大战的原因是什么？」一个需要人类思维的强问题：「你的曾祖母 1914 年住在萨拉热窝。请使用一手史料给她写一封信，告诉她你了解到的关于她的世界为何崩塌的原因。你想让她知道哪些她当时不可能知道的事情？」",
        "第二个问题需要个人联结、共情能力、史料评估和叙事建构——这些 AI 都无法真正做到。培训教师的问题设计能力，意味着将他们从「学生需要知道什么？」引向「学生需要思考什么？」这是一个超越 AI 的根本性教学转变。",
      ],
    },
    {
      id: "process-pedagogy",
      title: "能力三：过程教学法",
      paragraphs: [
        "当 AI 能即刻产出打磨好的最终作品时，教育价值就从产品转向了过程。教师需要成为「过程教学法」的专家——让思维过程本身成为学习的对象。",
        "这意味着通过思维日志、修订历史和课堂讨论录音来记录学生的思维过程。意味着教授元认知策略——如何规划、监控和评估自己的思维。意味着创建过程即产品的作业：设计日志、研究叙事、学习反思。也意味着将 AI 用作「思维伙伴」而非「代劳机器」——让学生批判 AI 输出，而不是接受它。",
        "过程教学法并不新鲜——它根植于写作过程理论、建构主义和项目式学习。但 AI 让它变得紧迫。当产品可以被轻松生产时，只有过程还保有教育价值。",
      ],
    },
    {
      id: "ethical-navigation",
      title: "能力四：伦理导航",
      paragraphs: [
        "AI 在教育中的伦理维度复杂而持续演变。什么情况下使用 AI 构成学术不诚实？当 AI 参与了学生的作品时，署名应该如何处理？当 AI 在教育内容中延续偏见时怎么办？使用 AI 驱动的工具时，如何保护学生隐私？",
        "教师需要应对这些问题的框架——不是僵化的规则，而是能随技术演变而调适的伦理推理能力。最重要的是，教师需要为学生示范 AI 的合伦理使用：对自己的 AI 使用保持透明，诚实面对其中的张力和不确定性，创建一种课堂文化，让关于技术的伦理问题和技术本身一样被认真对待。",
      ],
    },
    {
      id: "augmented-workflow",
      title: "能力五：人机协作工作流设计",
      paragraphs: [
        "最后一项能力是实操性的：懂得如何设计一个策略性地结合人类和 AI 能力的工作流。这意味着识别教学工作流中哪些任务真正受益于 AI——内容生成、差异化教学、初步反馈；哪些任务应该完全保留为人类——关系建设、复杂评估、敏感沟通；以及哪些任务应该是混合式的——AI 生成草稿，教师用专业判断精炼。",
        "未来最成功的教师不会是使用 AI 最多的人，也不会是完全回避 AI 的人。而是那些对何时使用何种方式发展出精细判断力的人——并且愿意随着技术和自身理解的演进不断修正这种判断。",
        "关于 AI 与教学的对话一直被工具主导——用哪个 AI、怎么写提示词、怎么检测它。这可以理解，但远远不够。更深层的变革根本不是关于工具。它关乎的是：当知识免费、生产廉价时，做一个教育者意味着什么——当判断力、关系、伦理推理以及提出好问题的能力不仅变得有价值，而且变得不可或缺。",
      ],
    },
  ],
  pullQuote:
    "AI 专业发展的目标不是培养善于使用 AI 的教师。而是培养善于在 AI 存在的世界中教学的教师——这是一个更大、也更有意思的挑战。",
  pullQuoteAfter: 2,
  tags: [TAG_ZH.pd, TAG_ZH.ai, TAG_ZH.teaching],
};

// ---------------------------------------------------------------------------
// ARTICLE 5 — The Moment Before the Breakthrough
// ---------------------------------------------------------------------------

const POST_5_EN: BlogPost = {
  slug: "the-moment-before-the-breakthrough",
  title: "The Moment Before the Breakthrough",
  excerpt:
    "There is a moment when a student is right on the edge of understanding — and the hardest thing a teacher can do is resist the urge to give the answer. Why the struggle itself is where learning lives.",
  coverImage: "/blog/cover-the-last-lecture.svg",
  category: "philosophy",
  readTime: "9 min",
  date: "Feb 1, 2026",
  author: AUTHOR_EN,
  lead: "There is a moment in every classroom — if you know where to look — that most people never see. It happens between the confusion and the understanding, between the frustration and the insight. It is the moment when a student is right on the edge of getting it, and the temptation to intervene, to explain one more time, to simply give the answer, is almost unbearable. The best teachers have learned to sit in that discomfort. To wait. To trust that the struggle itself is where the learning lives.",
  sections: [
    {
      id: "light-bulb-myth",
      title: "The Myth of the Light Bulb",
      paragraphs: [
        "We love the metaphor of the \"aha moment\" — the light bulb clicking on, the sudden flash of understanding. It is clean, dramatic, satisfying. It makes for good movies about education. But experienced teachers know the truth is messier.",
        "Real understanding does not arrive like a light switch. It arrives like dawn — gradually, unevenly, with false starts and moments of darkness that feel like they will last forever. A student might grasp a concept on Tuesday, lose it by Thursday, and rediscover it in a completely different form the following week.",
        "The \"breakthrough\" we celebrate is usually just the visible tip of a long, invisible process of neural rewiring, emotional growth, and conceptual reconstruction. The real work happened in all those moments of productive struggle that nobody applauded, nobody photographed, nobody posted about. The light bulb is not a moment. It is a season.",
      ],
    },
    {
      id: "courage-not-to-help",
      title: "The Courage to Not Help",
      paragraphs: [
        "One of the hardest skills in teaching is knowing when not to intervene. Research on productive struggle — particularly Manu Kapur's work on productive failure — shows that students who are allowed to wrestle with problems before receiving instruction learn more deeply than students who receive direct instruction first. The mechanism is intuitive once you understand it: struggle creates mental scaffolding that makes subsequent learning more meaningful.",
        "But in practice, watching a student struggle feels terrible. It triggers every instinct teachers have — to help, to nurture, to protect from frustration. When a student looks up with confused eyes and says \"I don't get it,\" the natural response is to explain. The revolutionary response is to say, \"Tell me what you have tried so far.\"",
        "This is not cruelty. It is the deepest form of respect — the belief that this student is capable of figuring it out, that their struggle has value, that they do not need to be rescued. It says: I believe in you more than you believe in yourself right now. And I will stay right here while you find your way.",
      ],
    },
    {
      id: "teachers-who-never-see",
      title: "The Teachers Who Never See Their Impact",
      paragraphs: [
        "There is a particular cruelty in the timing of education: teachers plant seeds they may never see bloom. A high school English teacher who teaches a student to love reading will not know that the student, ten years later, reads to her own children every night. A math teacher who teaches problem decomposition will not know that his student, now an engineer, uses that exact thinking process to design structures that keep people safe.",
        "A kindergarten teacher who creates a safe and joyful classroom will not know that her student, now in her thirties, still remembers that room as the first place she ever felt she belonged. That memory sustained her through things the teacher could not have imagined.",
        "Education research calls this the \"sleeper effect\" — the full impact of teaching often does not manifest until years or decades later. This means teachers are chronically under-informed about their own effectiveness. They see the struggle. They see the confusion. They see the student who did not pass the test. They rarely see what came after. It is one of the profession's great injustices: the people who change the most lives have the least evidence that they did so.",
      ],
    },
    {
      id: "trust-the-process",
      title: "Learning to Trust the Process",
      paragraphs: [
        "If you are a teacher reading this, here is what I want you to consider: the student who is frustrating you right now — the one who is not getting it, the one who seems stuck, the one whose test scores are not moving — may be in the most important phase of their learning. They may be right on the edge of a breakthrough that neither you nor they can see yet.",
        "This is not naive optimism. It is what the research consistently shows: learning is nonlinear, messy, and full of apparent setbacks that are actually evidence of deeper processing. The plateau before the jump. The confusion before the clarity. The breakdown before the breakthrough.",
        "Your job in that moment is not to fix it. Your job is to hold space for it — to create the conditions where struggle is safe, where confusion is normal, where not knowing is the beginning of knowing, not the end of it. And then to be patient enough to wait. Because what happens next — when the understanding finally arrives, not as a gift from you but as something the student built with their own hands — that is the moment that will matter. Not just today. For the rest of their life.",
      ],
    },
  ],
  pullQuote:
    "The best teachers do not eliminate struggle. They create the conditions where struggle becomes safe, productive, and — eventually — transformative.",
  pullQuoteAfter: 1,
  tags: [TAG.pedagogy, TAG.teaching, TAG.research],
};

const POST_5_ZH: BlogPost = {
  slug: "the-moment-before-the-breakthrough",
  title: "突破前的那一刻",
  excerpt:
    "有一个时刻，学生就站在理解的边缘——而教师能做的最难的事，是忍住不给答案。为什么挣扎本身才是学习真正发生的地方。",
  coverImage: "/blog/cover-the-last-lecture.svg",
  category: "philosophy",
  readTime: "9 分钟",
  date: "2026年2月1日",
  author: AUTHOR_ZH,
  lead: "每间教室里都有这样一个时刻——如果你知道去哪里找的话——大多数人永远不会注意到它。它发生在困惑与理解之间，挫败与顿悟之间。那是学生即将「懂了」的临界点，而想要出手干预、再解释一遍、直接给出答案的冲动，几乎无法抗拒。最好的教师学会了坐在那种不适中。等待。相信挣扎本身才是学习栖居的地方。",
  sections: [
    {
      id: "light-bulb-myth",
      title: "灯泡的神话",
      paragraphs: [
        "我们热爱「顿悟时刻」的隐喻——灯泡亮了，理解瞬间到来。它干净、戏剧化、令人满足。这是教育电影最爱的桥段。但有经验的教师知道，真相要凌乱得多。",
        "真正的理解不是像开关一样到来的。它更像黎明——渐进的、不均匀的，充满了虚假的开端和仿佛永远不会结束的黑暗时刻。一个学生可能周二理解了一个概念，周四又忘了，下周又以完全不同的形式重新发现它。",
        "我们庆祝的「突破」通常只是一个漫长而隐形的过程的露出水面的冰山一角——神经通路的重新连接、情感的成长、概念的重构。真正的工作发生在所有那些无人鼓掌、无人拍照、无人转发的、有成效的挣扎时刻里。灯泡不是一个瞬间。它是一个季节。",
      ],
    },
    {
      id: "courage-not-to-help",
      title: "不帮忙的勇气",
      paragraphs: [
        "教学中最难的技能之一，是知道什么时候不应该干预。关于「有成效的挣扎」的研究——特别是 Manu Kapur 关于「有成效的失败」的工作——表明，在接受指导之前被允许与问题搏斗的学生，比先接受直接教学的学生学得更深。这个机制一旦理解就很直觉：挣扎创造了心智支架，让后续的学习更有意义。",
        "但在实践中，看着学生挣扎的感觉很糟糕。它触发了教师的每一个本能——去帮助、去呵护、去保护他们免受挫败。当一个学生抬起困惑的眼睛说「我不懂」时，自然的反应是去解释。革命性的反应是说：「告诉我你到目前为止试了什么。」",
        "这不是残忍。这是最深层的尊重——相信这个学生有能力自己弄明白，相信他们的挣扎有价值，相信他们不需要被拯救。它说的是：我现在比你更相信你自己。而你在寻找出路的时候，我会一直在这里。",
      ],
    },
    {
      id: "teachers-who-never-see",
      title: "从未看到自己影响力的教师",
      paragraphs: [
        "教育的时间安排有一种特殊的残酷：教师播下的种子，可能永远看不到开花。一位教会学生热爱阅读的高中英语教师，不会知道那个学生十年后每晚都给自己的孩子读书。一位教授问题分解的数学教师，不会知道他的学生现在是一名工程师，正是用那种思维方式在设计保护人们安全的建筑。",
        "一位营造了安全而快乐的课堂的幼儿园教师，不会知道她的学生现在三十多岁了，仍然记得那间教室是她第一次感到归属感的地方。那个记忆支撑她度过了教师无法想象的种种困境。",
        "教育研究称此为「沉睡效应」——教学的全部影响往往要在数年或数十年后才会显现。这意味着教师长期缺乏关于自身成效的信息。他们看到的是挣扎。他们看到的是困惑。他们看到的是没通过考试的学生。他们很少看到后来发生了什么。这是这个职业的一大不公：改变最多生命的人，拥有最少的证据证明自己做到了。",
      ],
    },
    {
      id: "trust-the-process",
      title: "学会信任过程",
      paragraphs: [
        "如果你是一位正在读这篇文章的教师，我想请你思考这件事：此刻让你沮丧的那个学生——那个「不开窍」的、似乎卡住的、成绩没有起色的——可能正处于他们学习过程中最重要的阶段。他们可能就站在一个你和他们都还看不到的突破的边缘。",
        "这不是天真的乐观主义。这是研究一再显示的事实：学习是非线性的、凌乱的，充满了表面上的倒退，而那些倒退实际上是更深层处理的证据。跳跃前的平台期。清晰前的困惑。突破前的崩溃。",
        "你在那个时刻的工作不是去修复它。你的工作是为它留出空间——创造挣扎是安全的、困惑是正常的、不知道是知道的开始而非终点的条件。然后足够耐心地等待。因为接下来发生的——当理解终于到来，不是作为你的馈赠，而是作为学生亲手建造的东西——那才是真正重要的时刻。不只是今天。是他们余生。",
      ],
    },
  ],
  pullQuote:
    "最好的教师不会消除挣扎。他们创造的是让挣扎变得安全、有成效、并且——最终——具有变革力量的条件。",
  pullQuoteAfter: 1,
  tags: [TAG_ZH.pedagogy, TAG_ZH.teaching, TAG_ZH.research],
};

// ---------------------------------------------------------------------------
// ARTICLE 6 — What Students Remember
// ---------------------------------------------------------------------------

const POST_6_EN: BlogPost = {
  slug: "what-students-remember",
  title: "What Students Remember (And What They Don't)",
  excerpt:
    "Ask any adult to name something they learned in school and they will struggle. Ask them to name a teacher who changed their life, and the answer comes immediately.",
  coverImage: "/blog/cover-the-homework-apocalypse.svg",
  category: "analysis",
  readTime: "8 min",
  date: "Jan 18, 2026",
  author: AUTHOR_EN,
  lead: "Ask any adult to name one specific thing they learned in school, and most will struggle. The quadratic formula, maybe. The date of a war. A handful of vocabulary words in a language they have mostly forgotten. Now ask them to name a teacher who changed their life, and the answer comes immediately — not the content the teacher taught, but the way the teacher made them feel. This gap between what we teach and what students actually carry forward reveals something profound about the nature of education, and it should change the way we think about our work in the classroom.",
  sections: [
    {
      id: "forgetting-curve",
      title: "The Forgetting Curve and the Feeling Curve",
      paragraphs: [
        "In 1885, Hermann Ebbinghaus published his research on human memory, documenting what he called the \"forgetting curve\" — the exponential decay of factual recall over time. His findings, replicated countless times since, show that without reinforcement, we forget roughly 70% of new information within 24 hours and up to 90% within a week.",
        "This is not a failure of education. It is a fundamental feature of human cognition. Our brains are not designed to retain isolated facts. They are designed to retain patterns, emotions, and stories.",
        "What Ebbinghaus did not study — and what education research has since revealed — is that while factual content fades rapidly, the emotional and relational dimensions of a learning experience persist for decades. Students forget what you said, but they remember how you made them feel. They forget the lesson plan, but they remember the time you stayed after school. They forget the content, but they remember the moment you believed in them when they did not believe in themselves.",
      ],
    },
    {
      id: "accidental-curriculum",
      title: "The Accidental Curriculum",
      paragraphs: [
        "Every teacher has a formal curriculum — the content standards, learning objectives, and assessment benchmarks that structure their instruction. But every teacher also has what we might call an \"accidental curriculum\" — the unplanned, often unintentional lessons students absorb simply by being in the teacher's presence.",
        "The accidental curriculum includes how you respond when you make a mistake — teaching students whether vulnerability is safe or dangerous. How you handle conflict between students — teaching them about justice and compassion. How you talk about your own learning process — teaching them whether intelligence is fixed or something that grows. And how you treat the least powerful person in the room — teaching them what character really looks like when nobody important is watching.",
        "Research by Hamre and Pianta found that the quality of teacher-student interactions predicted academic outcomes more reliably than curriculum quality, class size, or teaching experience. In other words, who you are in the classroom matters more than what you teach. The accidental curriculum is the real curriculum. Everything else is just the syllabus.",
      ],
    },
    {
      id: "comments-that-changed",
      title: "The Comments That Changed Trajectories",
      paragraphs: [
        "In interviews with successful adults about their educational experiences, a striking pattern emerges: the moments that changed their lives were almost always small, specific, and probably forgotten by the teacher who created them.",
        "\"She wrote 'you have a real eye for this' on my art project in fifth grade. I am a designer now.\" \"He pulled me aside after class and said 'you are smarter than you think you are.' Nobody had ever said that to me before.\" \"She let me borrow a book from her personal shelf and told me she thought I would like it. I remember feeling seen for the first time in my life.\"",
        "These micro-moments — a comment on an assignment, a moment of sustained eye contact during a lecture, a question that showed genuine curiosity about a student's thinking — are the real currency of education. They are easy to underestimate precisely because they feel so small. But in the economy of a young person's developing identity, a single sentence from a trusted adult can be worth more than a semester of instruction.",
      ],
    },
    {
      id: "teaching-for-long-memory",
      title: "Teaching for the Long Memory",
      paragraphs: [
        "If students forget content but remember relationships, what does this mean for how we teach? It does not mean content is unimportant — students need knowledge foundations to build higher-order thinking. But it means the way we deliver content matters as much as the content itself.",
        "Practically, this looks like: taking time for individual conversations, even brief ones — a student who feels personally known by their teacher learns more effectively. Being intentional about how you respond to wrong answers — the student will not remember the correct answer you gave, but they will remember whether it felt safe to be wrong in your class. Sharing your own intellectual struggles — students who see their teacher as a fellow learner develop healthier relationships with uncertainty.",
        "And perhaps most importantly: marking moments of growth, not just achievement. \"Last month you could not do this. Look at you now\" is a sentence that can echo for years. You are not just teaching content. You are teaching a human being how to be a learner. And that is something they will carry with them long after they have forgotten everything else you ever said.",
      ],
    },
  ],
  pullQuote:
    "Students forget what you taught them. They never forget how you made them feel about learning. That feeling — whether learning is joyful or threatening, whether intelligence is fixed or growing — shapes the rest of their lives.",
  pullQuoteAfter: 2,
  tags: [TAG.research, TAG.teaching, TAG.future],
};

const POST_6_ZH: BlogPost = {
  slug: "what-students-remember",
  title: "学生记住的（和他们不记得的）",
  excerpt:
    "问任何一个成年人他在学校学到了什么具体内容，大多数人会答不上来。问他哪位老师改变了他的人生，答案立刻脱口而出。",
  coverImage: "/blog/cover-the-homework-apocalypse.svg",
  category: "analysis",
  readTime: "8 分钟",
  date: "2026年1月18日",
  author: AUTHOR_ZH,
  lead: "问任何一个成年人说出一件他在学校学到的具体知识，大多数人都会犯难。可能是二次方程式。某场战争的年份。一门已经大半遗忘的语言中的几个单词。现在问他们说出一位改变了他们人生的老师，答案会立刻脱口而出——不是那位老师教过的内容，而是那位老师让他们产生的感受。我们教的东西和学生真正带走的东西之间的这道鸿沟，揭示了教育本质中某种深刻的东西，它应该改变我们思考课堂工作的方式。",
  sections: [
    {
      id: "forgetting-curve",
      title: "遗忘曲线与感受曲线",
      paragraphs: [
        "1885 年，赫尔曼·艾宾浩斯发表了关于人类记忆的研究，记录了他所称的「遗忘曲线」——事实性记忆随时间的指数级衰减。他的发现（此后被无数次复制验证）表明，如果不加强化，我们会在 24 小时内遗忘大约 70% 的新信息，一周内遗忘高达 90%。",
        "这不是教育的失败。这是人类认知的基本特征。我们的大脑天生不是用来存储孤立事实的。它们被设计用来保留模式、情感和故事。",
        "艾宾浩斯没有研究的——而后来的教育研究揭示的——是：虽然事实性内容迅速消退，但学习经历中的情感和关系维度却能持续数十年。学生会忘记你说了什么，但记得你让他们产生了怎样的感受。忘记了教案，但记得你放学后留下来帮他们那次。忘记了内容，但记得在他们不相信自己的时候，你相信了他们。",
      ],
    },
    {
      id: "accidental-curriculum",
      title: "意外的课程",
      paragraphs: [
        "每位教师都有一份正式课程——内容标准、学习目标和评估基准。但每位教师也有一份我们可以称之为「意外课程」的东西——学生仅仅因为身处教师的存在中而吸收的、未经计划、往往无意识的课程。",
        "意外课程包括：你犯错时如何回应——教学生脆弱是安全的还是危险的。你如何处理学生之间的冲突——教他们关于公正和同理心。你如何谈论自己的学习过程——教他们智力是固定的还是可以成长的。以及你如何对待教室里最没有权力的人——教他们在没有重要人物注视时，品格的真正含义是什么。",
        "Hamre 和 Pianta 的研究发现，师生互动质量对学业成果的预测力，比课程质量、班级规模或教学经验都更可靠。换句话说，你在课堂上是什么样的人，比你教什么更重要。意外课程才是真正的课程。其他一切不过是教学大纲。",
      ],
    },
    {
      id: "comments-that-changed",
      title: "改变人生轨迹的那些话",
      paragraphs: [
        "在对成功人士进行的教育经历访谈中，一个惊人的模式浮现：改变他们人生的那些时刻，几乎总是微小的、具体的，而且很可能已经被创造它们的老师忘记了。",
        "「她在我五年级的美术作品上写了'你对这个真有感觉'。我现在是一名设计师。」「他下课后把我叫到一边说'你比你以为的要聪明'。之前从来没有人对我说过这句话。」「她让我从她个人书架上借了一本书，说她觉得我会喜欢。我记得那是我人生中第一次感到被'看见'。」",
        "这些微小的时刻——作业上的一句评语、课堂上一次持续的目光交汇、一个表现出对学生思维真诚好奇的提问——才是教育的真正货币。它们之所以容易被低估，恰恰是因为它们感觉太小了。但在一个正在形成身份认同的年轻人的经济体中，一位被信任的成年人说的一句话，可能比整整一学期的教学更有价值。",
      ],
    },
    {
      id: "teaching-for-long-memory",
      title: "为长期记忆而教",
      paragraphs: [
        "如果学生忘记了内容但记住了关系，这对我们的教学方式意味着什么？这不意味着内容不重要——学生需要知识基础来构建高阶思维。但这意味着我们传递内容的方式与内容本身同样重要。",
        "在实践中，这看起来像是：花时间进行个别对话，哪怕很简短——一个感到被老师「个人性地了解」的学生学习更有效。刻意思考你如何回应错误答案——学生不会记住你给出的正确答案，但他们会记住在你的课堂上犯错是安全的还是危险的。分享你自己的智识困惑——看到老师也是学习者的学生，会与不确定性建立更健康的关系。",
        "也许最重要的是：标记成长的时刻，而不仅仅是成就的时刻。「上个月你还不会这个，你看看你现在」——这句话可以回响数年。你不只是在教内容。你是在教一个人如何成为一个学习者。而那是他们在忘记你说过的所有其他话之后，仍然会带在身上的东西。",
      ],
    },
  ],
  pullQuote:
    "学生会忘记你教了什么。但他们永远不会忘记你让他们对学习产生了怎样的感受。那种感受——学习是快乐的还是恐惧的，智力是固定的还是成长的——塑造了他们的余生。",
  pullQuoteAfter: 2,
  tags: [TAG_ZH.research, TAG_ZH.teaching, TAG_ZH.future],
};

// ---------------------------------------------------------------------------
// ARTICLE 7 — The Weight of Thirty Futures
// ---------------------------------------------------------------------------

const POST_7_EN: BlogPost = {
  slug: "the-weight-of-thirty-futures",
  title: "The Weight of Thirty Futures",
  excerpt:
    "Every student in the room is someone's entire world. The impossible weight of that responsibility, and how the teachers who last learn to carry it without being crushed.",
  coverImage: "/blog/cover-the-two-sigma-trap.svg",
  category: "philosophy",
  readTime: "10 min",
  date: "Jan 5, 2026",
  author: AUTHOR_EN,
  lead: "At 7:45 on a Monday morning, before the students arrive, a teacher stands in an empty classroom and does something that looks unremarkable from the outside. She arranges chairs, writes the day's objective on the board, checks that the projector works. But inside her mind, something far more complex is happening. She is thinking about the student whose parents are divorcing and who has not turned in homework for two weeks. About the student who disclosed anxiety so severe she has stopped eating. About the brilliant student who is coasting because nobody has ever challenged him. About the student with an IEP whose accommodations she must implement without singling him out. Thirty students. Thirty sets of needs, fears, hopes, and struggles. Thirty futures that will be shaped, in part, by what happens in this room today. She takes a breath. The bell rings.",
  sections: [
    {
      id: "emotional-labor",
      title: "The Emotional Labor Nobody Talks About",
      paragraphs: [
        "In 1983, sociologist Arlie Hochschild coined the term \"emotional labor\" to describe jobs that require workers to manage their emotions as a core professional function — flight attendants maintaining warmth, customer service representatives absorbing frustration. Teaching, by any measure, is one of the most emotionally labor-intensive professions in existence. And yet, this dimension of the work is almost completely absent from teacher training, professional development, and public conversation about education.",
        "Teachers are expected to be simultaneously warm and authoritative, nurturing and demanding, patient and efficient. They are expected to regulate the emotions of thirty young people while also regulating their own. They absorb anxiety, defuse anger, model calm they do not always feel, and carry home concerns about students they can do very little about.",
        "A 2019 study by Yin and Lee found that emotional labor was the single strongest predictor of teacher burnout — more significant than workload, class size, or administrative pressure. We are losing teachers not because the content is too hard to teach, but because the emotional weight is too heavy to carry alone.",
      ],
    },
    {
      id: "three-am-worry",
      title: "The 3 AM Worry",
      paragraphs: [
        "Every experienced teacher knows the 3 AM worry. You wake up thinking about a student. Not about whether they understood the quadratic formula — about whether they are okay. The student who flinched when you raised your voice slightly to get the class's attention. The student whose lunch was always a bag of chips. The student who wrote something in their journal that made you call the school counselor before the end of the day.",
        "Teaching is one of the few professions where the boundaries between professional concern and personal care are genuinely impossible to maintain. You cannot \"leave work at work\" when work is a teenager who told you something they have not told anyone else. You cannot \"practice self-care\" your way out of knowing that one of your students is sleeping in a car.",
        "The 3 AM worry is not a sign of poor boundaries. It is a sign that you are doing the job the way it needs to be done — with your whole self. The question is not how to stop caring. The question is how to care without being consumed.",
      ],
    },
    {
      id: "holding-without-fixing",
      title: "Holding Without Fixing",
      paragraphs: [
        "Here is the most difficult lesson in teaching, and one that no education program adequately prepares you for: there are problems you can see but cannot solve. You can see that a student is being neglected, but you cannot give them a different family. You can see that a student has a learning difference, but you cannot undo years of missed early intervention. You can see that a student is brilliant, but you cannot overcome the systemic barriers that will limit their opportunities after they leave your classroom.",
        "The skill that experienced teachers develop — slowly, painfully, and never completely — is the ability to hold these realities without being destroyed by them. Not to deny them. Not to become numb to them. But to hold them with what therapists call \"compassionate witnessing.\"",
        "To say, in effect: I see you. I cannot fix everything. But I can make this classroom a place where you are safe, where you are seen, and where you are expected to grow. That may not feel like enough. But for many students, it is the most anyone has ever given them.",
      ],
    },
    {
      id: "why-teachers-stay",
      title: "Why Teachers Stay",
      paragraphs: [
        "Given everything described above — the emotional weight, the sleepless nights, the problems without solutions — why do teachers stay? The answer, when you ask them, is remarkably consistent. They do not stay for the salary. They do not stay for the prestige. They do not stay because the system makes it easy.",
        "They stay for the moments. The moment when a struggling reader finishes their first chapter book and looks up with an expression that rewires your understanding of what matters. The moment when a student who spent three months refusing to participate raises their hand for the first time. The moment when a former student comes back to visit and says: \"You are the reason I went to college.\"",
        "These moments do not cancel out the weight. They exist alongside it. Teaching is not a profession where the good outweighs the bad in some tidy ledger. It is a profession where joy and grief coexist in the same hour, sometimes in the same conversation. The teachers who last are not the ones who avoid the weight. They are the ones who have learned to carry it — and who have found, in the act of carrying it, a purpose that makes the heaviness bearable.",
      ],
    },
  ],
  pullQuote:
    "Thirty students. Thirty sets of needs, fears, hopes, and struggles. Thirty futures that will be shaped, in part, by what happens in this room today. The teachers who last are not the ones who avoid that weight. They are the ones who have learned to carry it.",
  pullQuoteAfter: 2,
  tags: [TAG.teaching, TAG.future, TAG.pedagogy],
};

const POST_7_ZH: BlogPost = {
  slug: "the-weight-of-thirty-futures",
  title: "三十个未来的重量",
  excerpt:
    "教室里的每一个学生都是某个人的整个世界。那份不可能的责任之重，以及坚持下来的教师如何学会承担它而不被压垮。",
  coverImage: "/blog/cover-the-two-sigma-trap.svg",
  category: "philosophy",
  readTime: "10 分钟",
  date: "2026年1月5日",
  author: AUTHOR_ZH,
  lead: "周一早上 7:45，学生到达之前，一位教师站在空荡荡的教室里做着从外面看起来平淡无奇的事情。她摆好椅子，在黑板上写下今天的学习目标，检查投影仪是否正常。但在她的脑海里，正在发生的事情要复杂得多。她在想那个父母正在离婚、已经两周没交作业的学生。那个透露了严重到不再进食的焦虑症的学生。那个才华横溢却在混日子、因为从没有人真正挑战过他的学生。那个有个别化教育计划、她必须在不把他单独挑出来的情况下实施特殊安排的学生。三十个学生。三十组需求、恐惧、希望和挣扎。三十个将在某种程度上被今天这间教室里发生的事塑造的未来。她深吸一口气。铃响了。",
  sections: [
    {
      id: "emotional-labor",
      title: "没有人谈论的情感劳动",
      paragraphs: [
        "1983 年，社会学家阿莉·霍赫希尔德创造了「情感劳动」这个术语，用来描述那些要求从业者将管理自身情绪作为核心职业功能的工作——空乘人员保持温暖、客服代表吸收愤怒。以任何标准衡量，教学都是现存情感劳动强度最高的职业之一。然而，这个维度几乎完全缺席于教师培训、专业发展和关于教育的公共对话中。",
        "教师被期望同时做到温暖和权威、呵护和要求、耐心和高效。他们被期望在调节三十个年轻人的情绪的同时调节自己的情绪。他们吸收焦虑、化解愤怒、展示出自己并不总是感受到的平静，把对那些他们几乎无力帮助的学生的担忧带回家。",
        "Yin 和 Lee 2019 年的研究发现，情感劳动是教师职业倦怠最强的单一预测因子——比工作量、班级规模或行政压力都更显著。我们正在失去教师，不是因为教学内容太难，而是因为情感的重量太重，重到无法独自承担。",
      ],
    },
    {
      id: "three-am-worry",
      title: "凌晨三点的担忧",
      paragraphs: [
        "每位有经验的教师都知道凌晨三点的担忧。你醒来想着一个学生。不是想着他是否理解了二次方程式——而是想着他是否还好。那个你稍微提高嗓门维持课堂秩序时畏缩了一下的学生。那个午餐永远是一袋薯片的学生。那个在日记里写了什么让你当天结束前就打了学校心理辅导员电话的学生。",
        "教学是极少数职业关怀与个人感情之间的边界真正无法维持的职业之一。当「工作」是一个把只告诉过你的秘密告诉你的青少年时，你无法「把工作留在工作中」。当你知道你的一个学生正睡在车里时，你无法靠「自我关怀」来摆脱那份知道。",
        "凌晨三点的担忧不是边界感差的表现。它是你正在以这份工作需要的方式做着这份工作的标志——全身心地投入。问题不是如何停止在乎。问题是如何在乎而不被吞噬。",
      ],
    },
    {
      id: "holding-without-fixing",
      title: "承托而非修复",
      paragraphs: [
        "这是教学中最困难的一课，也是没有任何教育项目充分准备你面对的：有些问题你看得见但解决不了。你看得见一个学生被忽视，但你无法给他一个不同的家庭。你看得见一个学生有学习差异，但你无法弥补多年错过的早期干预。你看得见一个学生才华横溢，但你无法克服他离开你的教室后将限制他机会的系统性障碍。",
        "有经验的教师慢慢培养出来的——缓慢地、痛苦地、永远不完全地——是一种能力：承托这些现实而不被它们摧毁。不否认它们。不对它们麻木。而是以心理治疗师所说的「富有同理心的见证」来承托它们。",
        "实际上是在说：我看见你了。我无法修复一切。但我可以让这间教室成为一个你安全的、你被看见的、你被期待成长的地方。那可能感觉不够。但对很多学生来说，这是有史以来任何人给过他们最多的东西。",
      ],
    },
    {
      id: "why-teachers-stay",
      title: "教师为什么留下来",
      paragraphs: [
        "鉴于上述一切——情感的重量、失眠的夜晚、无解的问题——教师为什么还要留下来？当你去问他们时，答案出奇地一致。他们不是为了薪水而留。不是为了社会地位而留。不是因为这个体系让它变得容易而留。",
        "他们为了那些时刻而留。那个阅读困难的学生读完了人生第一本章节书，抬起头时脸上的表情重新定义了你对什么才重要的理解。那个花了三个月拒绝参与的学生第一次举起了手。那个毕业后回来看你的学生说：「因为你，我上了大学。」",
        "这些时刻并不能抵消那份重量。它们与重量共存。教学不是那种好处在某个整齐的账本中超过坏处的职业。它是一种喜悦与悲伤共存于同一个小时、有时共存于同一场对话中的职业。坚持下来的教师不是那些回避重量的人。而是那些学会了承担它的人——并且在承担的过程中找到了一种让沉重变得可以承受的使命感。",
      ],
    },
  ],
  pullQuote:
    "三十个学生。三十组需求、恐惧、希望和挣扎。三十个将在某种程度上被今天这间教室里发生的事塑造的未来。坚持下来的教师不是那些回避这份重量的人。而是那些学会了承担它的人。",
  pullQuoteAfter: 2,
  tags: [TAG_ZH.teaching, TAG_ZH.future, TAG_ZH.pedagogy],
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ARTICLE 8 — Why I Stopped Saying "I'm Just a Teacher"
// ---------------------------------------------------------------------------

const POST_8_EN: BlogPost = {
  slug: "im-just-a-teacher",
  title: "Why I Stopped Saying \"I'm Just a Teacher\"",
  excerpt:
    "The most damaging word in education isn't 'assessment' or 'accountability.' It's 'just.' How teachers internalize the devaluation of their own profession — and how to stop.",
  coverImage: "/blog/cover-beyond-prompt-engineering.svg",
  category: "practical",
  readTime: "8 min",
  date: "Dec 20, 2025",
  author: AUTHOR_EN,
  lead: "Listen to how teachers introduce themselves at parties. Not \"I'm a teacher\" — that comes with a qualifier. \"I'm just a teacher.\" \"I teach, but...\" \"I'm only a middle school teacher.\" It is a small word, \"just.\" But it carries enormous weight. It is the linguistic fingerprint of a profession that has been systematically devalued for so long that its members have internalized the devaluation. Doctors do not say \"I'm just a doctor.\" Lawyers do not say \"I'm just a lawyer.\" But teachers — the people entrusted with shaping the next generation of every profession — routinely diminish themselves before anyone else gets the chance to.",
  sections: [
    {
      id: "where-just-comes-from",
      title: "Where \"Just\" Comes From",
      paragraphs: [
        "The devaluation of teaching is not accidental. It is the result of converging forces that have been building for decades. Teaching is a historically feminized profession — and feminized professions are systematically compensated less than male-dominated ones requiring comparable education and skill. Teaching is public sector work — and public sector workers are routinely described as cost centers rather than value creators. Teaching involves caring for children — and work that involves care has always been treated as less serious, less intellectual, and less deserving of compensation than work that produces tangible products.",
        "But perhaps the most insidious force is cultural. We live in a society that equates value with compensation. When a first-year investment banker earns more than a twenty-year master teacher, the message is unmistakable: what you do does not matter as much. Hear that message enough times and it seeps inward. \"Just\" is what happens when external devaluation becomes internal belief.",
      ],
    },
    {
      id: "what-teaching-actually-requires",
      title: "What Teaching Actually Requires",
      paragraphs: [
        "If we described teaching as what it actually is — without the cultural baggage — it would be recognized as one of the most complex professional undertakings in existence. In a single class period, a teacher performs real-time cognitive assessment of thirty individuals, adapts communication strategies across multiple learning modalities, manages group dynamics that shift by the minute, makes hundreds of micro-decisions about pacing, emphasis, and emotional tone, and does all of this while maintaining the appearance of effortless control.",
        "Teaching requires deep content expertise, sophisticated interpersonal skills, executive function under pressure, creative problem-solving in real time, and emotional intelligence that would be the envy of any therapist. In most other fields, this combination of skills commands a six-figure salary and a corner office. In teaching, it commands a \"just.\"",
        "The disconnect between the actual complexity of teaching and its perceived value is one of the great cognitive distortions of our culture. And teachers themselves participate in it every time they minimize their work, apologize for their profession, or treat their expertise as something less than what it is.",
      ],
    },
    {
      id: "cost-of-just",
      title: "The Cost of \"Just\"",
      paragraphs: [
        "The internalized devaluation of teaching is not just a matter of self-esteem. It has real consequences. Teachers who see themselves as \"just teachers\" are less likely to advocate for better working conditions, less likely to push back on unreasonable demands, less likely to invest in their own professional growth, and more likely to burn out — because burnout thrives in environments where people believe their suffering is unimportant.",
        "It also affects students. When a teacher unconsciously communicates that their profession is not worthy of respect, students absorb that message. They learn that intellectual work with children is less valuable than intellectual work with spreadsheets. They learn that caring professions are fallback options, not first choices. They learn that \"just\" is the appropriate modifier for the person who spends more waking hours with them than anyone else in their lives.",
      ],
    },
    {
      id: "dropping-the-just",
      title: "Dropping the \"Just\"",
      paragraphs: [
        "Dropping \"just\" is not about ego. It is about accuracy. When someone asks what you do, try this: \"I teach.\" Full stop. No qualifier, no apology, no diminishing clause. Let the statement stand on its own and observe what happens — both in the other person's response and in your own body. It feels different. It feels like claiming something.",
        "Beyond language, dropping \"just\" means refusing to participate in your own devaluation. It means treating your professional expertise as expertise — not deferring to administrators, parents, or policy makers who have never managed a classroom. It means investing in your own development not because you are deficient, but because you are a professional in a complex field that demands continuous growth.",
        "And it means helping the next generation of teachers enter the profession without \"just\" already built into their professional identity. Because every time a veteran teacher says \"I'm just a teacher\" in front of a student teacher, the cycle deepens. The most radical thing you can do for the profession is to speak about it — and about yourself — with the respect it deserves.",
      ],
    },
  ],
  pullQuote:
    "Doctors do not say \"I'm just a doctor.\" Lawyers do not say \"I'm just a lawyer.\" But teachers — the people entrusted with shaping every other profession — routinely diminish themselves before anyone else gets the chance to.",
  pullQuoteAfter: 0,
  tags: [TAG.teaching, TAG.future, TAG.pedagogy],
};

const POST_8_ZH: BlogPost = {
  slug: "im-just-a-teacher",
  title: "我为什么不再说「我只是个老师」",
  excerpt:
    "教育界最具杀伤力的词不是「考核」或「问责」。而是「只是」。教师如何内化了对自己职业的贬低——以及如何停止这样做。",
  coverImage: "/blog/cover-beyond-prompt-engineering.svg",
  category: "practical",
  readTime: "8 分钟",
  date: "2025年12月20日",
  author: AUTHOR_ZH,
  lead: "听听教师在社交场合是如何介绍自己的。不是「我是教师」——那后面总跟着一个限定词。「我只是个老师。」「我教书的，不过……」「我只是一个初中老师。」「只是」是个很小的词，但它承载着巨大的重量。它是一个被系统性贬低了太久以至于从业者已经内化了这种贬低的职业的语言指纹。医生不会说「我只是个医生」。律师不会说「我只是个律师」。但教师——被托付去塑造每一个其他职业的下一代的人——在别人还没来得及贬低他们之前，就已经习惯性地贬低了自己。",
  sections: [
    {
      id: "where-just-comes-from",
      title: "「只是」从何而来",
      paragraphs: [
        "教学职业的贬值不是偶然的。它是几十年来多种力量汇聚的结果。教学历来是一个女性化的职业——而女性化的职业在系统性上比需要同等教育和技能的男性主导职业薪酬更低。教学是公共部门工作——而公共部门的工作者经常被描述为成本中心而非价值创造者。教学涉及照顾儿童——而涉及关怀的工作一直被视为不那么严肃、不那么需要智力、不那么值得获得报酬的。",
        "但也许最具渗透力的力量是文化性的。我们生活在一个将价值等同于报酬的社会中。当一个第一年的投资银行分析师的收入超过一个有二十年经验的特级教师时，信号是明确无误的：你做的事不那么重要。听够了这种信号，它就会渗透到内心。「只是」就是外部贬值变成内部信念后的产物。",
      ],
    },
    {
      id: "what-teaching-actually-requires",
      title: "教学到底需要什么",
      paragraphs: [
        "如果我们用它实际的样子来描述教学——去掉文化包袱——它会被认为是现存最复杂的专业活动之一。在一个课时内，教师要对三十个个体进行实时认知评估，跨多种学习模态调整沟通策略，管理每分钟都在变化的群体动态，做出数百个关于节奏、重点和情感基调的微决策，并且在完成所有这些的同时保持毫不费力的掌控感。",
        "教学需要深厚的学科专业知识、精密的人际交往技能、压力下的执行功能、实时创造性问题解决能力，以及让任何心理治疗师都会羡慕的情商。在大多数其他领域，这种技能组合意味着六位数的薪水和一间有景观的办公室。在教学中，它换来的是一个「只是」。",
        "教学的实际复杂性与其感知价值之间的脱节，是我们文化中最大的认知扭曲之一。而教师自己每次在贬低自己的工作、为自己的职业道歉、或把自己的专业知识当作低人一等的东西时，都在参与着这种扭曲。",
      ],
    },
    {
      id: "cost-of-just",
      title: "「只是」的代价",
      paragraphs: [
        "对教学的内化贬值不仅仅是自尊心的问题。它有真实的后果。认为自己「只是老师」的教师更不可能为更好的工作条件发声，更不可能拒绝不合理的要求，更不可能投资于自己的专业成长，更可能倦怠——因为倦怠在人们认为自己的痛苦不重要的环境中最容易滋生。",
        "它也影响学生。当教师无意识地传达出自己的职业不值得尊重时，学生会吸收这个信息。他们学到：与孩子相关的智力工作不如与电子表格相关的智力工作有价值。他们学到：关怀型职业是退路，不是首选。他们学到：「只是」是用来修饰那个每天与他们相处时间比其他任何人都多的人的恰当词汇。",
      ],
    },
    {
      id: "dropping-the-just",
      title: "放下那个「只是」",
      paragraphs: [
        "放下「只是」不是关于自负。而是关于准确。当有人问你做什么工作时，试试这样说：「我是教师。」句号。不加限定词，不道歉，不自我贬低。让这句话独立存在，然后观察会发生什么——对方的反应，和你自己身体里的感觉。感受不一样的。感觉像是在宣告什么。",
        "超越语言层面，放下「只是」意味着拒绝参与对自己的贬值。意味着把你的专业知识当作专业知识来对待——不在从未管理过一间教室的行政人员、家长或政策制定者面前退缩。意味着投资于自身的发展，不是因为你不够好，而是因为你是一个复杂领域的专业人士，这个领域要求持续的成长。",
        "也意味着帮助下一代教师在进入这个职业时，身份认同里没有预装「只是」二字。因为每一次一位资深教师在实习教师面前说「我只是个老师」，这个循环就加深一层。你能为这个职业做的最激进的事，就是用它应得的尊重来谈论它——以及谈论你自己。",
      ],
    },
  ],
  pullQuote:
    "医生不会说「我只是个医生」。律师不会说「我只是个律师」。但教师——被托付去塑造每一个其他职业的人——在别人还没来得及贬低他们之前，就已经习惯性地贬低了自己。",
  pullQuoteAfter: 0,
  tags: [TAG_ZH.teaching, TAG_ZH.future, TAG_ZH.pedagogy],
};

// ---------------------------------------------------------------------------
// ARTICLE 9 — The Quiet Students
// ---------------------------------------------------------------------------

const POST_9_EN: BlogPost = {
  slug: "the-quiet-students",
  title: "The Quiet Students: What Silence Really Means in a Classroom",
  excerpt:
    "They never raise their hand. They never cause trouble. And because of that, they never get the attention they need. The education system's blind spot for the students who suffer in silence.",
  coverImage: "/blog/cover-the-two-sigma-trap.svg",
  category: "practical",
  readTime: "9 min",
  date: "Dec 8, 2025",
  author: AUTHOR_EN,
  lead: "In every classroom, there is a student who has perfected the art of invisibility. She sits in the middle rows — not the back, where teachers watch for disengagement, and not the front, where participation is expected. She completes her work adequately but not remarkably. She does not raise her hand. She does not act out. She does not ask for help. She has learned, through years of practice, that the safest way to survive school is to disappear. And because she causes no problems, because her grades are acceptable, because there is always someone louder, more urgent, more visibly in need — she gets exactly what she has trained the system to give her. Nothing.",
  sections: [
    {
      id: "attention-economy",
      title: "The Attention Economy of a Classroom",
      paragraphs: [
        "A teacher's attention is a finite resource, and classrooms have their own brutal economy for distributing it. Research consistently shows that teacher attention flows disproportionately to two groups: high-performing students who volunteer answers and validate the teacher's instruction, and struggling or disruptive students whose behavior demands immediate response.",
        "The students in the middle — the quiet, compliant, adequate performers — receive the least interaction, the least feedback, and the least individualized support. A study by Jones and Gerig found that in typical classrooms, approximately 25% of students received no individual attention from the teacher during an entire class period. These invisible students were overwhelmingly quiet, compliant, and female.",
        "This is not because teachers do not care about quiet students. It is because the structure of a classroom creates triage conditions. When one student is disrupting the class and another is silently completing her worksheet, the disruption wins every time. The quiet student's compliance is mistaken for well-being. Her silence is mistaken for understanding. Her adequacy is mistaken for thriving.",
      ],
    },
    {
      id: "what-silence-means",
      title: "What Silence Actually Means",
      paragraphs: [
        "Silence in a classroom can mean many things. It can mean genuine engagement — the deep, focused thinking that does not need to announce itself. It can mean contentment — a student who is learning effectively and does not require additional support.",
        "But it can also mean: I am afraid of being wrong in front of my peers. I do not understand but I have learned that asking for help draws unwanted attention. I am dealing with something outside this classroom that consumes all my available emotional energy. I have been told — explicitly or implicitly — that my thoughts are not worth sharing. I have given up.",
        "The problem is that from the outside, all of these forms of silence look identical. A teacher scanning the room sees a quiet student working. What the teacher cannot see is whether that student is thinking deeply or shutting down, whether she is engaged or enduring, whether her silence is a sign of strength or a cry for help that she has learned to make inaudible.",
      ],
    },
    {
      id: "hearing-what-isnt-said",
      title: "Learning to Hear What Is Not Said",
      paragraphs: [
        "Great teachers develop a kind of emotional sonar for silence. They learn to read the quality of a student's quietness — to distinguish between the productive silence of concentration and the protective silence of withdrawal. This is not mysticism. It is pattern recognition developed through thousands of hours of careful observation.",
        "Practically, it involves: checking in with quiet students individually, not just publicly — a brief \"How are you doing with this?\" spoken quietly at a student's desk communicates something fundamentally different from calling on them in front of the class. Creating low-stakes participation structures — think-pair-share, written responses before discussion, anonymous polling — that give quiet students pathways to engage without the social risk of public performance.",
        "And perhaps most importantly, it means examining your own assumptions about silence. If you assume quiet means fine, you will miss the students who need you most. If you assume quiet means disengaged, you will misread the deep thinkers who process internally. The goal is not to make quiet students loud. The goal is to make sure their quietness is a choice, not a cage.",
      ],
    },
    {
      id: "what-quiet-students-need",
      title: "What They Need You to Know",
      paragraphs: [
        "If the quiet students in your classroom could speak — and here is the paradox, because the reason they need your help is precisely that they cannot — this is what many of them would say:",
        "I am not fine just because I am not a problem. My silence is not consent. I have things to say but I am not sure this room is safe enough to say them. I notice that you spend all your energy on the students who demand it, and I have learned to stop demanding. But I still need you. Maybe more than they do — because at least they have learned that their needs matter enough to make noise about.",
        "Please do not wait for me to come to you. I will not. Not because I do not want help, but because I have spent years learning that wanting help is a burden I should not place on others. Come to me. Quietly, individually, without making it a scene. Ask me a question that shows you see me — not my grade, not my behavior record, but me. That might be enough to change everything.",
      ],
    },
  ],
  pullQuote:
    "Her silence is mistaken for understanding. Her compliance is mistaken for well-being. Her adequacy is mistaken for thriving. And because she causes no problems, she gets exactly what she has trained the system to give her. Nothing.",
  pullQuoteAfter: 0,
  tags: [TAG.pedagogy, TAG.teaching, TAG.research],
};

const POST_9_ZH: BlogPost = {
  slug: "the-quiet-students",
  title: "安静的学生：沉默在教室里到底意味着什么",
  excerpt:
    "他们从不举手，从不惹事。正因如此，他们从未得到他们需要的关注。教育系统对那些在沉默中受苦的学生的盲区。",
  coverImage: "/blog/cover-the-two-sigma-trap.svg",
  category: "practical",
  readTime: "9 分钟",
  date: "2025年12月8日",
  author: AUTHOR_ZH,
  lead: "每间教室里都有一个把隐身术练到完美的学生。她坐在中间几排——不是后排，老师会关注后排有没有人走神；也不是前排，前排被默认需要积极参与。她的作业完成得中规中矩但不出彩。她不举手。不捣乱。不求助。她通过多年的练习学会了：在学校最安全的生存方式是消失。而因为她不制造问题，因为她的成绩还过得去，因为总有人更吵、更急迫、更明显地需要帮助——她得到的恰恰是她训练这个系统给予她的东西：什么也没有。",
  sections: [
    {
      id: "attention-economy",
      title: "课堂上的注意力经济学",
      paragraphs: [
        "教师的注意力是一种有限资源，而教室有自己残酷的分配经济学。研究一再表明，教师的注意力不成比例地流向两类学生：主动回答问题、认可教师教学的高表现学生，以及行为要求即时回应的困难或破坏纪律的学生。",
        "中间地带的学生——安静的、顺从的、表现尚可的——获得最少的互动、最少的反馈和最少的个别化支持。Jones 和 Gerig 的研究发现，在典型课堂中，大约 25% 的学生在整个课时内没有收到教师的任何个别关注。这些隐形学生绝大多数是安静的、顺从的、女性的。",
        "这不是因为教师不关心安静的学生。而是因为课堂的结构创造了急诊分诊的条件。当一个学生在扰乱课堂而另一个在安静地做练习题时，扰乱总是赢。安静学生的顺从被误认为是健康。她的沉默被误认为是理解。她的「还行」被误认为是「很好」。",
      ],
    },
    {
      id: "what-silence-means",
      title: "沉默到底意味着什么",
      paragraphs: [
        "教室里的沉默可以意味着很多东西。它可以意味着真正的投入——深度的、专注的思考，不需要宣告自己的存在。它可以意味着满足——一个学习有效、不需要额外支持的学生。",
        "但它也可以意味着：我害怕在同学面前说错。我不理解但我已经学会了求助会招来不想要的注意。我正在处理教室之外的某些事情，它消耗了我所有可用的情感能量。我被告知——明确地或含蓄地——我的想法不值得分享。我已经放弃了。",
        "问题在于，从外面看，所有这些形式的沉默看起来完全一样。教师扫视教室看到一个安静学习的学生。教师看不到的是，这个学生是在深度思考还是在关机，她是在投入还是在忍受，她的沉默是力量的标志还是一声她已经学会让人听不见的求救。",
      ],
    },
    {
      id: "hearing-what-isnt-said",
      title: "学会倾听没有说出的话",
      paragraphs: [
        "优秀的教师发展出一种对沉默的情感声呐。他们学会解读一个学生安静的「质地」——区分专注的建设性沉默和退缩的自我保护性沉默。这不是神秘主义。这是通过数千小时细心观察培养出的模式识别能力。",
        "在实践中，这包括：单独与安静的学生沟通，而不只是公开地——在学生桌边轻声问一句「这部分你感觉怎么样？」传递的东西与在全班面前点名回答有着根本性的不同。创建低风险的参与结构——先思考再配对分享、讨论前先写下回应、匿名投票——给安静学生提供参与的路径，而不需要承担公开表演的社交风险。",
        "也许最重要的是，审视你自己对沉默的假设。如果你假设安静就是没问题，你会错过最需要你的学生。如果你假设安静就是不投入，你会误读那些在内部处理信息的深度思考者。目标不是让安静的学生变吵。目标是确保他们的安静是一种选择，而不是一个牢笼。",
      ],
    },
    {
      id: "what-quiet-students-need",
      title: "他们需要你知道的",
      paragraphs: [
        "如果你课堂上那些安静的学生能够开口说话——这正是悖论所在，因为他们需要你帮助的原因恰恰是他们说不出口——他们中的许多人会说这样的话：",
        "我没有制造问题不代表我没有问题。我的沉默不是同意。我有想说的话，但我不确定这间教室是否安全到可以说出来。我注意到你把所有精力都花在那些要求得到关注的学生身上，而我已经学会了不再要求。但我仍然需要你。也许比他们更需要——因为至少他们已经学会了：自己的需求重要到值得为之发出声响。",
        "请不要等我来找你。我不会的。不是因为我不想要帮助，而是因为我花了好几年学到：想要帮助是一种不该加在别人身上的负担。来找我吧。安静地，单独地，不要搞得像什么大事。问我一个表明你看见了我的问题——不是我的成绩，不是我的行为记录，而是我这个人。那可能就足以改变一切。",
      ],
    },
  ],
  pullQuote:
    "她的沉默被误认为是理解。她的顺从被误认为是健康。她的「还行」被误认为是「很好」。而因为她不制造问题，她得到的恰恰是她训练这个系统给予她的东西：什么也没有。",
  pullQuoteAfter: 0,
  tags: [TAG_ZH.pedagogy, TAG_ZH.teaching, TAG_ZH.research],
};

// ---------------------------------------------------------------------------
// ARTICLE 10 — Teaching Is a Creative Act
// ---------------------------------------------------------------------------

const POST_10_EN: BlogPost = {
  slug: "teaching-is-a-creative-act",
  title: "Teaching Is a Creative Act (We Just Forgot)",
  excerpt:
    "Every lesson plan is a design problem. Every classroom interaction is improvisation. How the bureaucratization of education stripped teaching of its artistic soul — and how to get it back.",
  coverImage: "/blog/cover-the-last-lecture.svg",
  category: "analysis",
  readTime: "10 min",
  date: "Nov 22, 2025",
  author: AUTHOR_EN,
  lead: "Before teaching became a profession defined by standards, rubrics, and accountability metrics, it was understood as something closer to an art. Socrates did not have learning objectives. Maria Montessori did not fill out pacing guides. Jaime Escalante did not teach to a standardized test — he taught to a vision of what his students could become. Somewhere between the genuine need for educational quality and the bureaucratic impulse to measure everything, we lost something essential: the understanding that teaching, at its core, is a creative act. And teachers — many of whom entered the profession because they felt the pull of that creativity — have been slowly suffocating under systems that treat them as technicians executing someone else's design.",
  sections: [
    {
      id: "design-problem",
      title: "Every Lesson Is a Design Problem",
      paragraphs: [
        "Consider what a teacher actually does when she plans a lesson. She starts with a destination — a concept or skill her students need to develop. She assesses where her students currently are — not as a group, but as thirty individuals with different starting points, different learning styles, different emotional states on this particular day. Then she designs an experience that will move them from where they are to where they need to be.",
        "This is, by any definition, a design problem. And like all good design, it requires empathy for the user, creative problem-solving, iterative refinement, and the courage to deviate from the plan when the plan is not working. It requires the same skills that we celebrate in architects, product designers, and UX researchers — the ability to hold a vision of the end state while remaining responsive to the messy reality of implementation.",
        "But we do not call it design. We call it \"lesson planning\" and we reduce it to a template: objective, hook, guided practice, independent practice, assessment. The template is not wrong — it captures important structural elements. But it strips out the creative judgment that makes the difference between a lesson that functions and a lesson that transforms.",
      ],
    },
    {
      id: "improvisation",
      title: "The Art of Classroom Improvisation",
      paragraphs: [
        "No lesson survives first contact with students. Every experienced teacher knows this. You plan for thirty minutes of guided discussion and a student asks a question that takes the conversation in a direction you did not anticipate — and it is a better direction. You plan a hands-on activity and realize five minutes in that half the class is lost and the other half is bored. You plan a quiet writing exercise and a student starts crying.",
        "In these moments, teachers improvise. Not randomly — with the disciplined spontaneity of a jazz musician who has internalized the harmonic structure so deeply that she can depart from it meaningfully. The teacher draws on content knowledge, pedagogical expertise, knowledge of individual students, and real-time emotional intelligence to make decisions that no script could have anticipated.",
        "This is creative work of the highest order. It requires the same combination of preparation and presence that defines great performers in any field. And yet, in the current educational climate, improvisation is treated as deviation. When a teacher departs from the scripted curriculum to follow a student's genuine curiosity, she is not celebrated for responsiveness. She is at risk of being marked as non-compliant.",
      ],
    },
    {
      id: "what-bureaucracy-took",
      title: "What Bureaucracy Took",
      paragraphs: [
        "The standardization movement in education was born from legitimate concerns: too much variation in quality, too little accountability, too many students falling through the cracks. Standards, assessments, and accountability systems were designed to ensure a minimum level of quality everywhere.",
        "But minimum floors have a way of becoming maximum ceilings. When every minute of instructional time must be accounted for in a pacing guide, there is no room for the unplanned conversation that changes a student's relationship with a subject. When every assessment must align to a standard, there is no room for the assignment that asks students to do something genuinely original. When teacher evaluation depends on adherence to a prescribed model, there is no room for the pedagogical experimentation that leads to breakthrough practices.",
        "The result is a profession that has been systematically de-skilled. Teachers who were trained to think are now expected to execute. Teachers who entered the profession to create are now asked to comply. The creativity that drew them to teaching — the joy of designing an experience, of watching a student's mind open, of finding the perfect question at the perfect moment — has been bureaucratized into lesson plan templates and data tracking spreadsheets.",
      ],
    },
    {
      id: "reclaiming-the-art",
      title: "Reclaiming the Art",
      paragraphs: [
        "Reclaiming teaching as a creative act does not mean abandoning structure or accountability. It means recognizing that structure and creativity are not opposites — they are collaborators. The sonnet has fourteen lines and a rigid rhyme scheme, and it has produced some of the most creative work in human history. Constraints do not kill creativity. Bad constraints do.",
        "For teachers, reclaiming the art means giving yourself permission to experiment within the structure — to try a new approach, to follow a tangent, to design an assessment that excites you, to trust your professional judgment even when it departs from the script. It means treating every class period as a performance in the best sense: prepared, intentional, and alive to what is happening in the room right now.",
        "For administrators and policy makers, it means understanding that you cannot standardize your way to excellence. You can standardize your way to adequacy — and sometimes that is necessary. But the difference between adequate teaching and transformative teaching is creativity, and creativity cannot be mandated, measured on a rubric, or delivered through a pacing guide. It can only be cultivated — by trusting teachers, giving them room to experiment, and treating them as the creative professionals they were trained to be.",
      ],
    },
  ],
  pullQuote:
    "Teachers who were trained to think are now expected to execute. Teachers who entered the profession to create are now asked to comply. The creativity that drew them to teaching has been bureaucratized into lesson plan templates and data tracking spreadsheets.",
  pullQuoteAfter: 2,
  tags: [TAG.teaching, TAG.pedagogy, TAG.future],
};

const POST_10_ZH: BlogPost = {
  slug: "teaching-is-a-creative-act",
  title: "教学是一种创造性行为（我们只是忘了）",
  excerpt:
    "每份教案都是一个设计问题。每次课堂互动都是即兴创作。官僚化如何剥夺了教学的艺术灵魂——以及如何找回它。",
  coverImage: "/blog/cover-the-last-lecture.svg",
  category: "analysis",
  readTime: "10 分钟",
  date: "2025年11月22日",
  author: AUTHOR_ZH,
  lead: "在教学被标准、量规和问责指标定义为一种职业之前，它被理解为更接近一种艺术。苏格拉底没有学习目标。蒙特梭利没有填写教学进度表。海梅·埃斯卡兰特没有按标准化考试来教——他教的是一个关于学生能够成为什么的愿景。在对教育质量的真实需求和衡量一切的官僚冲动之间的某个地方，我们失去了一些根本性的东西：对教学的核心是一种创造性行为的理解。而教师——他们中的许多人正是因为感受到了那种创造力的召唤才进入这个职业——一直在那些将他们视为执行别人设计的技术员的系统下慢慢窒息。",
  sections: [
    {
      id: "design-problem",
      title: "每堂课都是一个设计问题",
      paragraphs: [
        "想想一位教师在备课时实际上在做什么。她从一个目的地开始——一个学生需要发展的概念或技能。她评估学生目前在哪里——不是作为一个群体，而是作为三十个有着不同起点、不同学习方式、在这特定一天有着不同情绪状态的个体。然后她设计一个能让他们从现在的位置走到需要到达的位置的经历。",
        "以任何定义来看，这都是一个设计问题。而像所有好的设计一样，它需要对用户的共情、创造性的问题解决、迭代式的改进，以及当计划不起作用时偏离计划的勇气。它需要的技能与我们在建筑师、产品设计师和用户体验研究员身上赞美的完全相同——在保持对最终状态的愿景的同时，对实施过程中混乱的现实保持响应力。",
        "但我们不叫它设计。我们叫它「备课」，然后把它简化为一个模板：目标、引入、引导练习、自主练习、评估。模板没有错——它捕捉了重要的结构元素。但它剥离了那个让「一堂还行的课」和「一堂改变人的课」之间产生差异的创造性判断。",
      ],
    },
    {
      id: "improvisation",
      title: "课堂即兴创作的艺术",
      paragraphs: [
        "没有哪份教案能在与学生的第一次接触后完好无损。每个有经验的教师都知道这一点。你计划了三十分钟的引导式讨论，一个学生问了一个把对话带向你没有预料到的方向的问题——而且那是一个更好的方向。你计划了一个动手活动，五分钟后发现一半学生迷失了，另一半无聊了。你计划了一个安静的写作练习，一个学生哭了。",
        "在这些时刻，教师即兴创作。不是随机的——而是带着爵士乐手那种有纪律的自发性，她已经把和声结构内化到如此深的程度，以至于她可以有意义地偏离它。教师调用学科知识、教学专长、对个别学生的了解以及实时情商来做出任何脚本都无法预见的决定。",
        "这是最高层次的创造性工作。它需要的是定义了任何领域伟大表演者的那种准备与临在的结合。然而在当前的教育氛围中，即兴创作被视为偏差。当一位教师偏离规定课程去跟随一个学生的真诚好奇时，她不会因为响应力而被赞扬。她面临的是被标记为「不合规」的风险。",
      ],
    },
    {
      id: "what-bureaucracy-took",
      title: "官僚化夺走了什么",
      paragraphs: [
        "教育中的标准化运动源于合理的关切：质量差异太大，问责太少，太多学生从缝隙中滑落。标准、评估和问责系统的设计目的是确保每个地方都有最低限度的质量。",
        "但最低标准有一种变成最高上限的倾向。当每一分钟的教学时间都必须在进度表中交代清楚时，就没有空间留给那种改变一个学生与一个学科之间关系的计划外对话了。当每一项评估都必须对齐标准时，就没有空间留给那种要求学生做真正原创之事的作业了。当教师评价取决于是否遵守规定模式时，就没有空间留给通向突破性实践的教学实验了。",
        "结果是一个被系统性地去技能化的职业。被培训来思考的教师现在被期望去执行。因为创造而进入这个职业的教师现在被要求去服从。那种吸引他们走向教学的创造力——设计一次体验的喜悦、看着学生的思维打开、在完美的时刻找到完美的问题——已经被官僚化成了教案模板和数据追踪表格。",
      ],
    },
    {
      id: "reclaiming-the-art",
      title: "找回那门艺术",
      paragraphs: [
        "将教学重新定义为创造性行为不意味着放弃结构或问责。它意味着认识到结构和创造力不是对立面——它们是合作者。十四行诗有十四行和严格的韵律格式，而它产生了人类历史上一些最具创造力的作品。约束不会杀死创造力。糟糕的约束才会。",
        "对教师来说，找回这门艺术意味着给自己许可在结构中实验——尝试一种新方法，跟随一个分支话题，设计一个让你自己也兴奋的评估，信任你的专业判断即使它偏离了脚本。意味着把每一个课时都当作最好意义上的一次演出：有准备的、有意图的、并且对当下这个房间里正在发生的事保持鲜活的感知。",
        "对管理者和政策制定者来说，它意味着理解：你无法通过标准化达到卓越。你可以通过标准化达到合格——有时候那是必要的。但合格的教学与变革性的教学之间的差别是创造力，而创造力无法被命令、无法用量规衡量、无法通过进度表传递。它只能被培育——通过信任教师，给他们实验的空间，把他们当作他们被培训成为的那种创造性专业人士。",
      ],
    },
  ],
  pullQuote:
    "被培训来思考的教师现在被期望去执行。因为创造而进入这个职业的教师现在被要求去服从。那种吸引他们走向教学的创造力，已经被官僚化成了教案模板和数据追踪表格。",
  pullQuoteAfter: 2,
  tags: [TAG_ZH.teaching, TAG_ZH.pedagogy, TAG_ZH.future],
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const POSTS_EN: readonly BlogPost[] = [POST_1_EN, POST_2_EN, POST_3_EN, POST_4_EN, POST_5_EN, POST_6_EN, POST_7_EN, POST_8_EN, POST_9_EN, POST_10_EN];
export const POSTS_ZH: readonly BlogPost[] = [POST_1_ZH, POST_2_ZH, POST_3_ZH, POST_4_ZH, POST_5_ZH, POST_6_ZH, POST_7_ZH, POST_8_ZH, POST_9_ZH, POST_10_ZH];

export function getPostBySlug(slug: string, locale: "en" | "zh" = "en"): BlogPost | undefined {
  const posts = locale === "zh" ? POSTS_ZH : POSTS_EN;
  return posts.find((p) => p.slug === slug);
}

export function getAllSlugs(): string[] {
  return POSTS_EN.map((p) => p.slug);
}

export function getRelatedPosts(currentSlug: string, locale: "en" | "zh" = "en"): BlogPost[] {
  const posts = locale === "zh" ? POSTS_ZH : POSTS_EN;
  return posts.filter((p) => p.slug !== currentSlug).slice(0, 3);
}
