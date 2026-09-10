import { dedupeTopicSeeds, type PblTopicSeed } from "@/lib/pbl/topic-seeds";

export type TopicDerivationMaterial = {
  title: string;
  type: "competition" | "pbl_case" | "driving_question" | "curriculum_map";
  source?: string;
  tags?: string[];
  originalContent?: string;
  content?: string;
};

const SUBJECT_TRANSLATIONS = new Map<string, string>([
  ["chemistry", "化学"],
  ["physics 1", "物理1"],
  ["physics 2", "物理2"],
  ["physics c electricity and magnetism", "物理C电磁学"],
  ["physics c mechanics", "物理C力学"],
  ["biology", "生物"],
  ["statistics", "统计学"],
  ["computer science principles", "计算机科学原理"],
  ["computer science a", "计算机科学A"],
  ["environmental science", "环境科学"],
  ["human geography", "人文地理"],
  ["macroeconomics", "宏观经济学"],
  ["microeconomics", "微观经济学"],
  ["psychology", "心理学"],
  ["world history modern", "世界历史"],
  ["world history: modern", "世界历史"],
  ["u.s. history", "美国历史"],
  ["united states history", "美国历史"],
  ["comparative government and politics", "比较政府与政治"],
  ["u.s. government and politics", "美国政府与政治"],
  ["english language and composition", "英语语言与写作"],
  ["english literature and composition", "英语文学与写作"],
  ["seminar", "学术研讨"],
  ["research", "学术研究"],
  ["calculus ab", "微积分AB"],
  ["calculus bc", "微积分BC"],
  ["calculus ab and bc", "微积分AB/BC"],
  ["precalculus", "预备微积分"],
  ["art and design", "艺术设计"],
  ["physics", "物理"],
  ["economics", "经济学"],
  ["geography", "地理"],
  ["global politics", "全球政治"],
  ["mathematics", "数学"],
  ["language and literature", "语言与文学"],
  ["visual arts", "视觉艺术"],
  ["design technology", "设计技术"],
  ["african american studies part 1", "非裔美国人研究 Part 1"],
  ["african american studies part 2", "非裔美国人研究 Part 2"],
  ["chinese language and culture", "中文语言与文化"],
  ["french language and culture", "法语语言与文化"],
  ["german language and culture", "德语语言与文化"],
  ["italian language and culture", "意大利语语言与文化"],
  ["japanese language and culture", "日语语言与文化"],
  ["spanish language and culture", "西班牙语语言与文化"],
  ["spanish literature and culture", "西班牙文学与文化"],
  ["latin", "拉丁语"],
  ["music theory", "音乐理论"],
  ["european history", "欧洲历史"],
]);

const EXTRACTED_TOPIC_MAP = new Map<
  string,
  {
    name: string;
    aliases: string[];
  }
>([
  ["atomic and molecular structure", { name: "原子与分子结构", aliases: ["atomic and molecular structure"] }],
  ["chemical reactions", { name: "化学反应", aliases: ["chemical reactions"] }],
  ["kinetics", { name: "化学动力学", aliases: ["kinetics"] }],
  ["equilibrium", { name: "化学平衡", aliases: ["equilibrium"] }],
  ["thermodynamics", { name: "热力学", aliases: ["thermodynamics"] }],
  ["systems", { name: "系统分析", aliases: ["systems"] }],
  ["fields", { name: "场与相互作用", aliases: ["fields"] }],
  ["force interactions", { name: "力与相互作用", aliases: ["force interactions"] }],
  ["change", { name: "变化过程", aliases: ["change"] }],
  ["conservation", { name: "守恒", aliases: ["conservation"] }],
  ["evolution", { name: "进化", aliases: ["evolution"] }],
  ["cellular processes", { name: "细胞过程", aliases: ["cellular processes"] }],
  ["energy and communication", { name: "能量与信息传递", aliases: ["energy and communication"] }],
  ["genetic information transfer", { name: "遗传信息传递", aliases: ["genetic information transfer"] }],
  ["ecology", { name: "生态学", aliases: ["ecology"] }],
  ["interactions", { name: "生物互作", aliases: ["interactions"] }],
  ["variation and distribution", { name: "变异与分布", aliases: ["variation and distribution"] }],
  ["patterns and uncertainty", { name: "模式与不确定性", aliases: ["patterns and uncertainty"] }],
  ["patterns and spatial organization", { name: "空间格局与组织", aliases: ["patterns and spatial organization"] }],
  [
    "data-based predictions, decisions, and conclusions",
    { name: "数据预测与决策", aliases: ["data-based predictions", "decisions", "conclusions"] },
  ],
  ["data-based predictions", { name: "数据预测与决策", aliases: ["data-based predictions"] }],
  ["decisions", { name: "数据预测与决策", aliases: ["decisions"] }],
  ["conclusions", { name: "数据预测与决策", aliases: ["conclusions"] }],
  ["energy transfer", { name: "能量传递", aliases: ["energy transfer"] }],
  [
    "interactions between earth systems",
    { name: "地球系统相互作用", aliases: ["interactions between earth systems"] },
  ],
  ["economic measurements", { name: "经济测度", aliases: ["economic measurements"] }],
  ["markets", { name: "市场机制", aliases: ["markets"] }],
  ["macroeconomic models", { name: "宏观经济模型", aliases: ["macroeconomic models"] }],
  ["macroeconomic policies", { name: "宏观经济政策", aliases: ["macroeconomic policies"] }],
  ["scarcity and markets", { name: "稀缺与市场", aliases: ["scarcity and markets"] }],
  ["costs", { name: "成本分析", aliases: ["costs"] }],
  ["benefits", { name: "收益分析", aliases: ["benefits"] }],
  ["marginal analysis", { name: "边际分析", aliases: ["marginal analysis"] }],
  ["humans and the environment", { name: "人与环境", aliases: ["humans and the environment"] }],
  [
    "cultural developments and interactions",
    { name: "文化发展与互动", aliases: ["cultural developments and interactions"] },
  ],
  ["governance", { name: "治理", aliases: ["governance"] }],
  ["economic systems", { name: "经济制度", aliases: ["economic systems"] }],
  ["power and authority", { name: "权力与权威", aliases: ["power and authority"] }],
  ["legitimacy and stability", { name: "合法性与稳定", aliases: ["legitimacy and stability"] }],
  ["democratization", { name: "民主化", aliases: ["democratization"] }],
  ["internal and external forces", { name: "内外部力量", aliases: ["internal and external forces"] }],
  ["rhetorical situation", { name: "修辞情境", aliases: ["rhetorical situation"] }],
  ["claims and evidence", { name: "论点与证据", aliases: ["claims and evidence"] }],
  ["reasoning and organization", { name: "论证与结构组织", aliases: ["reasoning and organization"] }],
  ["style", { name: "写作风格", aliases: ["style"] }],
  ["character", { name: "人物塑造", aliases: ["character"] }],
  ["setting", { name: "情境与背景", aliases: ["setting"] }],
  ["structure", { name: "文本结构", aliases: ["structure"] }],
  ["perspective", { name: "叙事视角", aliases: ["perspective"] }],
  ["limits", { name: "极限", aliases: ["limits"] }],
  ["the analysis of functions", { name: "函数分析", aliases: ["the analysis of functions"] }],
  ["modularity", { name: "模块化", aliases: ["modularity"] }],
  ["variables", { name: "变量", aliases: ["variables"] }],
  ["control structures", { name: "控制结构", aliases: ["control structures"] }],
  ["pitch", { name: "音高", aliases: ["pitch"] }],
  ["rhythm", { name: "节奏", aliases: ["rhythm"] }],
  ["form", { name: "形式结构", aliases: ["form"] }],
  ["musical design", { name: "音乐设计", aliases: ["musical design"] }],
  ["algorithms and programs", { name: "算法与程序", aliases: ["algorithms and programs"] }],
  ["abstraction", { name: "抽象建模", aliases: ["abstraction"] }],
  ["computing innovations", { name: "计算创新", aliases: ["computing innovations"] }],
  ["computing systems", { name: "计算系统", aliases: ["computing systems"] }],
  ["internet", { name: "互联网系统", aliases: ["internet"] }],
  ["global development indicators", { name: "全球发展指标", aliases: ["global development indicators"] }],
  ["public health", { name: "公共卫生", aliases: ["public health"] }],
  ["climate data", { name: "气候数据", aliases: ["climate data"] }],
  ["sustainability", { name: "可持续发展", aliases: ["sustainability"] }],
  ["historical thinking", { name: "历史思维", aliases: ["historical thinking"] }],
  ["argumentation", { name: "论证写作", aliases: ["argumentation"] }],
]);

const SUMMARY_HINTS: Array<{ pattern: RegExp; topic: PblTopicSeed }> = [
  { pattern: /atomic and molecular structure/i, topic: { name: "原子与分子结构", aliases: ["atomic and molecular structure"], relevance: "supporting" } },
  { pattern: /chemical reactions/i, topic: { name: "化学反应", aliases: ["chemical reactions"], relevance: "supporting" } },
  { pattern: /kinetics/i, topic: { name: "化学动力学", aliases: ["kinetics"], relevance: "supporting" } },
  { pattern: /equilibrium/i, topic: { name: "化学平衡", aliases: ["equilibrium"], relevance: "supporting" } },
  { pattern: /thermodynamics/i, topic: { name: "热力学", aliases: ["thermodynamics"], relevance: "supporting" } },
  { pattern: /force interactions/i, topic: { name: "力与相互作用", aliases: ["force interactions"], relevance: "supporting" } },
  { pattern: /fields/i, topic: { name: "场与相互作用", aliases: ["fields"], relevance: "supporting" } },
  { pattern: /conservation/i, topic: { name: "守恒", aliases: ["conservation"], relevance: "supporting" } },
  { pattern: /evolution/i, topic: { name: "进化", aliases: ["evolution"], relevance: "supporting" } },
  { pattern: /cellular processes/i, topic: { name: "细胞过程", aliases: ["cellular processes"], relevance: "supporting" } },
  { pattern: /genetic information transfer/i, topic: { name: "遗传信息传递", aliases: ["genetic information transfer"], relevance: "supporting" } },
  { pattern: /ecology/i, topic: { name: "生态学", aliases: ["ecology"], relevance: "supporting" } },
  { pattern: /variation and distribution/i, topic: { name: "变异与分布", aliases: ["variation and distribution"], relevance: "supporting" } },
  { pattern: /patterns and uncertainty/i, topic: { name: "模式与不确定性", aliases: ["patterns and uncertainty"], relevance: "supporting" } },
  { pattern: /algorithms and programs/i, topic: { name: "算法与程序", aliases: ["algorithms and programs"], relevance: "supporting" } },
  { pattern: /abstraction/i, topic: { name: "抽象建模", aliases: ["abstraction"], relevance: "supporting" } },
  { pattern: /computing innovations/i, topic: { name: "计算创新", aliases: ["computing innovations"], relevance: "supporting" } },
  { pattern: /internet/i, topic: { name: "互联网系统", aliases: ["internet"], relevance: "supporting" } },
  { pattern: /world development indicators/i, topic: { name: "全球发展指标", aliases: ["world development indicators"], relevance: "supporting" } },
  { pattern: /public health/i, topic: { name: "公共卫生", aliases: ["public health"], relevance: "supporting" } },
  { pattern: /climate/i, topic: { name: "气候与环境数据", aliases: ["climate data"], relevance: "supporting" } },
];

const TITLE_RULES: Array<{ pattern: RegExp; topic: PblTopicSeed }> = [
  { pattern: /\b(sdgs?|sustainable development goals?|global goals?)\b/i, topic: { name: "可持续发展目标", aliases: ["sustainable development goals", "sdgs", "global goals"], relevance: "primary" } },
  { pattern: /Nature Latest News/i, topic: { name: "前沿科学新闻", aliases: ["frontier science news", "nature latest news"], relevance: "primary" } },
  { pattern: /国家统计局/i, topic: { name: "中国社会经济统计", aliases: ["national bureau of statistics of china", "中国国家统计局公开数据"], relevance: "primary" } },
  { pattern: /生态环境部/i, topic: { name: "中国生态环境监测", aliases: ["ministry of ecology and environment of china", "中国生态环境部公开数据"], relevance: "primary" } },
  { pattern: /\b(world bank|oecd|imf|eurostat|our world in data|gapminder|inequality|un data|data\.gov)\b/i, topic: { name: "全球发展指标", aliases: ["global development indicators", "development data"], relevance: "primary" } },
  { pattern: /\b(who|unicef|cdc|china cdc|hosa)\b/i, topic: { name: "公共卫生数据", aliases: ["public health data", "health statistics"], relevance: "primary" } },
  { pattern: /\b(faostat)\b/i, topic: { name: "农业与粮食系统", aliases: ["agriculture and food systems", "faostat"], relevance: "primary" } },
  { pattern: /\b(global carbon|openaq|earth observatory|envirofacts|envirothon|noaa|copernicus|climate)\b/i, topic: { name: "气候与环境数据", aliases: ["climate and environmental data"], relevance: "primary" } },
  { pattern: /\b(earthquake|hazard)\b/i, topic: { name: "自然灾害分析", aliases: ["natural hazards", "earthquake analysis"], relevance: "primary" } },
  { pattern: /\b(arcgis)\b/i, topic: { name: "地理空间分析", aliases: ["geospatial analysis", "arcgis"], relevance: "primary" } },
  { pattern: /\b(github octoverse|octoverse)\b/i, topic: { name: "软件协作趋势", aliases: ["software collaboration trends", "octoverse"], relevance: "primary" } },
  { pattern: /\b(gdelt)\b/i, topic: { name: "全球媒体事件", aliases: ["global media events", "gdelt"], relevance: "primary" } },
  { pattern: /\b(google trends)\b/i, topic: { name: "搜索行为趋势", aliases: ["search behavior trends", "google trends"], relevance: "primary" } },
  { pattern: /\b(kaggle)\b/i, topic: { name: "开放数据集", aliases: ["open datasets", "kaggle datasets"], relevance: "primary" } },
  { pattern: /\b(himcm|mcm\/icm|math modeling challenge|immc|purple comet|statistics competition)\b/i, topic: { name: "数学建模", aliases: ["mathematical modeling", "modeling challenge"], relevance: "primary" } },
  { pattern: /\b(first robotics|first tech|vex|world robot olympiad|zero robotics|robotics)\b/i, topic: { name: "机器人工程", aliases: ["robotics engineering", "robotics competition"], relevance: "primary" } },
  { pattern: /\b(future city)\b/i, topic: { name: "城市设计挑战", aliases: ["urban design challenge", "future city"], relevance: "primary" } },
  { pattern: /\b(conrad|technovation|blue ocean|diamond challenge|entrepreneur)\b/i, topic: { name: "创新创业", aliases: ["innovation and entrepreneurship"], relevance: "primary" } },
  { pattern: /\b(investment|wharton)\b/i, topic: { name: "投资与商业决策", aliases: ["investment competition", "business decision making"], relevance: "primary" } },
  { pattern: /\b(isef|science talent|ecybermission|breakthrough junior|igem)\b/i, topic: { name: "学生科学研究", aliases: ["student science research"], relevance: "primary" } },
  { pattern: /\b(john locke|essay competition|extended essay|seminar|research scoring|research ced)\b/i, topic: { name: "学术论证与研究", aliases: ["academic argument and research"], relevance: "primary" } },
  { pattern: /\b(history day|facing history|zinn)\b/i, topic: { name: "历史探究", aliases: ["historical inquiry"], relevance: "primary" } },
  { pattern: /\b(pblworks|edutopia|new tech network|high tech high|el education|design for change|world savvy)\b/i, topic: { name: "项目式学习设计", aliases: ["project-based learning", "pbl design"], relevance: "primary" } },
  { pattern: /\b(openscied)\b/i, topic: { name: "现象驱动科学探究", aliases: ["phenomenon-based science inquiry", "openscied"], relevance: "primary" } },
  { pattern: /\b(teachengineering)\b/i, topic: { name: "工程设计挑战", aliases: ["engineering design challenge"], relevance: "primary" } },
  { pattern: /\b(app inventor|code\.org|computer science principles|computer science a)\b/i, topic: { name: "计算思维与编程", aliases: ["computational thinking and programming"], relevance: "primary" } },
  { pattern: /\b(nasa|earthdata|space apps)\b/i, topic: { name: "地球与空间系统", aliases: ["earth and space systems"], relevance: "primary" } },
  { pattern: /\b(phET)\b/i, topic: { name: "科学模拟探究", aliases: ["science simulation inquiry", "phet"], relevance: "primary" } },
  { pattern: /\b(aapt)\b/i, topic: { name: "物理探究实验", aliases: ["physics inquiry labs"], relevance: "primary" } },
  { pattern: /\b(cern)\b/i, topic: { name: "粒子物理探究", aliases: ["particle physics inquiry"], relevance: "primary" } },
  { pattern: /\b(geography)\b/i, topic: { name: "地理空间分析", aliases: ["geospatial analysis"], relevance: "primary" } },
  { pattern: /\b(global politics|government and politics)\b/i, topic: { name: "治理与公共政策", aliases: ["governance and public policy"], relevance: "primary" } },
  { pattern: /\b(english language|english literature)\b/i, topic: { name: "英语论证与文本分析", aliases: ["english argument and text analysis"], relevance: "primary" } },
  { pattern: /\b(art and design|visual arts)\b/i, topic: { name: "艺术创作与策展", aliases: ["art making and curation"], relevance: "primary" } },
  { pattern: /\b(design technology)\b/i, topic: { name: "设计技术", aliases: ["design technology"], relevance: "primary" } },
  { pattern: /\b(calculus|precalculus)\b/i, topic: { name: "函数与微积分", aliases: ["functions and calculus"], relevance: "primary" } },
  { pattern: /\b(chemistry)\b/i, topic: { name: "化学探究", aliases: ["chemistry inquiry"], relevance: "primary" } },
  { pattern: /\b(physics)\b/i, topic: { name: "物理探究", aliases: ["physics inquiry"], relevance: "primary" } },
  { pattern: /\b(biology)\b/i, topic: { name: "生物系统", aliases: ["biology systems"], relevance: "primary" } },
  { pattern: /\b(statistics)\b/i, topic: { name: "统计推断", aliases: ["statistical inference"], relevance: "primary" } },
];

function normalizeText(text: string) {
  return text.replace(/\r/g, "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractSummary(material: TopicDerivationMaterial) {
  const raw = material.originalContent?.trim() || material.content?.trim() || "";
  if (!raw) return "";

  let body = raw;
  const summaryIndex = body.indexOf("页面摘要：");
  if (summaryIndex >= 0) {
    body = body.slice(summaryIndex + "页面摘要：".length);
  }

  const usageIndex = body.indexOf("教学使用建议：");
  if (usageIndex >= 0) {
    body = body.slice(0, usageIndex);
  }

  return normalizeText(body);
}

function splitTopicList(segment: string) {
  return segment
    .replace(/\bincluding the internet\b/gi, "internet")
    .replace(/\bincluding\b/gi, "")
    .split(/,|;|\//i)
    .map((item) => item.trim().replace(/^(and|or)\s+/i, ""))
    .filter(Boolean);
}

function mapConceptPhrase(phrase: string): PblTopicSeed | null {
  const normalized = normalizeKey(phrase);
  const known = EXTRACTED_TOPIC_MAP.get(normalized);
  if (known) {
    return {
      name: known.name,
      aliases: known.aliases,
      relevance: "supporting",
    };
  }

  if (phrase.length < 4 || phrase.length > 60) return null;
  if (/course materials|exam details|course audit|teacher resources|updated for/i.test(phrase)) return null;

  return {
    name: phrase,
    relevance: "supporting",
  };
}

function buildCurriculumPrimaryTopic(material: TopicDerivationMaterial): PblTopicSeed | null {
  if (material.type !== "curriculum_map") return null;

  const apMatch = material.title.match(/^AP (.+?) (Course and Exam Description|CED)$/i);
  if (apMatch) {
    const subject = apMatch[1]?.trim() ?? "";
    const translated = SUBJECT_TRANSLATIONS.get(subject.toLowerCase()) ?? subject;
    return {
      name: `${translated}课程框架`,
      aliases: [`AP ${subject}`, `${subject} curriculum framework`],
      relevance: "primary",
    };
  }

  const ibMatch = material.title.match(/^IB DP (.+?) Guide$/i);
  if (ibMatch) {
    const subject = ibMatch[1]?.trim() ?? "";
    const translated = SUBJECT_TRANSLATIONS.get(subject.toLowerCase()) ?? subject;
    return {
      name: `${translated}课程指南`,
      aliases: [`IB DP ${subject}`, `${subject} guide`],
      relevance: "primary",
    };
  }

  if (/AP Research Scoring Guidelines/i.test(material.title)) {
    return {
      name: "学术研究评价",
      aliases: ["research scoring guidelines", "academic paper rubric"],
      relevance: "primary",
    };
  }

  return null;
}

function buildPrimaryTopic(material: TopicDerivationMaterial): PblTopicSeed {
  const curriculumTopic = buildCurriculumPrimaryTopic(material);
  if (curriculumTopic) return curriculumTopic;

  for (const rule of TITLE_RULES) {
    if (rule.pattern.test(material.title) || rule.pattern.test(material.source ?? "")) {
      return rule.topic;
    }
  }

  const firstTag = material.tags?.[0]?.trim();
  if (firstTag) {
    return {
      name: `${firstTag}项目素材`,
      aliases: [material.title],
      relevance: "primary",
    };
  }

  return {
    name: material.title.trim(),
    relevance: "primary",
  };
}

function extractSupportingTopics(material: TopicDerivationMaterial) {
  const summary = extractSummary(material);
  if (!summary) return [] as PblTopicSeed[];

  const topics: PblTopicSeed[] = [];

  SUMMARY_HINTS.forEach((hint) => {
    if (hint.pattern.source === "internet" && !/computer science|computing/i.test(`${material.title} ${summary}`)) {
      return;
    }

    if (hint.pattern.test(summary)) {
      topics.push(hint.topic);
    }
  });

  const segmentPatterns = [
    /topics? like ([^.]+)\./gi,
    /concepts? like ([^.]+)\./gi,
    /explore concepts such as ([^.]+)\./gi,
    /focus on ([^.]+)\./gi,
  ];

  segmentPatterns.forEach((pattern) => {
    summary.matchAll(pattern).forEach((match) => {
      const segment = match[1]?.trim();
      if (!segment) return;

      splitTopicList(segment).forEach((phrase) => {
        const mapped = mapConceptPhrase(phrase);
        if (mapped) {
          topics.push(mapped);
        }
      });
    });
  });

  return dedupeTopicSeeds(topics).slice(0, 4);
}

export function deriveMaterialTopics(material: TopicDerivationMaterial) {
  const curriculumTopic = buildCurriculumPrimaryTopic(material);
  if (curriculumTopic) {
    return dedupeTopicSeeds([curriculumTopic]).slice(0, 5);
  }

  const primary = buildPrimaryTopic(material);
  const supporting = extractSupportingTopics(material);

  return dedupeTopicSeeds([primary, ...supporting]).slice(0, 5);
}
