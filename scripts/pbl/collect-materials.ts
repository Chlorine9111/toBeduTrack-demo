import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

type MaterialType = "competition" | "pbl_case" | "driving_question" | "curriculum_map";

type SourceSeed = {
  title: string;
  source: string;
  year: number;
  link: string;
  type: MaterialType;
  tags: string[];
  presetContent?: string;
};

type MaterialSeed = SourceSeed & {
  id: string;
  content?: string;
  originalContent?: string;
};

type SourceTuple = [
  title: string,
  source: string,
  year: number,
  link: string,
];

function grouped(type: MaterialType, tags: string[], rows: SourceTuple[]): SourceSeed[] {
  return rows.map(([title, source, year, link]) => ({
    title,
    source,
    year,
    link,
    type,
    tags: [...tags],
  }));
}

const BASE_SOURCE_SEEDS: SourceSeed[] = [
  {
    title: "HiMCM Contest Problems",
    source: "COMAP",
    year: 2025,
    link: "https://www.comap.com/contests/himcm-midmcm",
    type: "competition",
    tags: ["数学", "数学建模", "科技与创新", "分析"],
  },
  {
    title: "MCM/ICM Contest Problems",
    source: "COMAP",
    year: 2025,
    link: "https://www.comap.com/contests/mcm-icm",
    type: "competition",
    tags: ["数学", "工程", "数学建模", "创造"],
  },
  {
    title: "ISEF Finalist Abstracts",
    source: "Society for Science",
    year: 2025,
    link: "https://www.societyforscience.org/isef/",
    type: "competition",
    tags: ["生物", "化学", "实验探究", "科技与创新", "创造"],
  },
  {
    title: "John Locke Essay Competition Questions",
    source: "John Locke Institute",
    year: 2025,
    link: "https://essaycompetition.johnlocke.com/",
    type: "competition",
    tags: ["历史", "经济", "文献研究", "伦理与治理", "评价"],
  },
  {
    title: "National History Day Themes",
    source: "NHD",
    year: 2025,
    link: "https://nhd.org/en/",
    type: "competition",
    tags: ["历史", "文献研究", "文化与传承", "分析"],
  },
  {
    title: "PBLWorks Project Library",
    source: "PBLWorks",
    year: 2026,
    link: "https://www.pblworks.org/what-is-pbl",
    type: "pbl_case",
    tags: ["跨学科", "方案设计", "教育与发展", "创造"],
  },
  {
    title: "Edutopia PBL Guide",
    source: "Edutopia",
    year: 2026,
    link: "https://www.edutopia.org/project-based-learning-guide-resources",
    type: "pbl_case",
    tags: ["跨学科", "方案设计", "教育与发展", "应用"],
  },
  {
    title: "New Tech Network Project Examples",
    source: "New Tech Network",
    year: 2026,
    link: "https://newtechnetwork.org/resources/10-examples-of-project-based-learning-ideas-pbl/",
    type: "pbl_case",
    tags: ["跨学科", "工程设计", "教育与发展", "创造"],
  },
  {
    title: "UN SDGs Goals",
    source: "United Nations",
    year: 2026,
    link: "https://sdgs.un.org/goals",
    type: "driving_question",
    tags: ["环境科学", "社会学", "方案设计", "环境与生态", "评价"],
  },
  {
    title: "World Bank Open Data",
    source: "World Bank",
    year: 2026,
    link: "https://data.worldbank.org/",
    type: "driving_question",
    tags: ["经济", "数据分析", "城市与社区", "分析"],
  },
  {
    title: "Nature Latest News",
    source: "Nature",
    year: 2026,
    link: "https://www.nature.com/latest-news",
    type: "driving_question",
    tags: ["生物", "环境科学", "文献研究", "科技与创新", "分析"],
  },
  {
    title: "AP Chemistry Course and Exam Description",
    source: "AP Central",
    year: 2025,
    link: "https://apcentral.collegeboard.org/courses/ap-chemistry",
    type: "curriculum_map",
    tags: ["化学", "实验探究", "能源与材料", "应用"],
  },
  {
    title: "AP Physics 1 Course and Exam Description",
    source: "AP Central",
    year: 2025,
    link: "https://apcentral.collegeboard.org/courses/ap-physics-1",
    type: "curriculum_map",
    tags: ["物理", "实验探究", "工程设计", "分析"],
  },
  {
    title: "AP Biology Course and Exam Description",
    source: "AP Central",
    year: 2025,
    link: "https://apcentral.collegeboard.org/courses/ap-biology",
    type: "curriculum_map",
    tags: ["生物", "实验探究", "健康与医学", "分析"],
  },
  {
    title: "AP Statistics Course and Exam Description",
    source: "AP Central",
    year: 2025,
    link: "https://apcentral.collegeboard.org/courses/ap-statistics",
    type: "curriculum_map",
    tags: ["数学", "数据分析", "经济与商业", "应用"],
  },
  {
    title: "AP Computer Science Principles",
    source: "AP Central",
    year: 2025,
    link: "https://apcentral.collegeboard.org/courses/ap-computer-science-principles",
    type: "curriculum_map",
    tags: ["计算机", "工程设计", "科技与创新", "创造"],
  },
  {
    title: "IB Extended Essay Samples",
    source: "IBO",
    year: 2025,
    link: "https://www.ibo.org/programmes/diploma-programme/curriculum/dp-core/extended-essay/example-essays/",
    type: "pbl_case",
    tags: ["英语", "文献研究", "教育与发展", "分析"],
  },
  {
    title: "AP Research Scoring Guidelines 2024",
    source: "AP Central",
    year: 2024,
    link: "https://apcentral.collegeboard.org/media/pdf/ap24-sg-research-academic-paper.pdf",
    type: "curriculum_map",
    tags: ["英语", "文献研究", "教育与发展", "评价"],
  },
  {
    title: "中国国家统计局公开数据",
    source: "国家统计局",
    year: 2026,
    link: "https://www.stats.gov.cn/",
    type: "driving_question",
    tags: ["经济", "社会学", "数据分析", "城市与社区", "分析"],
  },
  {
    title: "中国生态环境部公开数据",
    source: "生态环境部",
    year: 2026,
    link: "https://www.mee.gov.cn/",
    type: "driving_question",
    tags: ["环境科学", "社会调研", "环境与生态", "分析"],
  },
];

const ADDITIONAL_SOURCE_SEEDS: SourceSeed[] = [
  ...grouped("competition", ["数学", "数学建模", "科技与创新", "分析"], [
    ["MathWorks Math Modeling Challenge (M3)", "SIAM", 2026, "https://m3challenge.siam.org/"],
    ["International Mathematical Modeling Challenge", "IMMC", 2026, "https://www.immchallenge.org/"],
    ["Purple Comet! Math Meet", "Math League", 2026, "https://purplecomet.org/"],
    ["European Statistics Competition", "Eurostat", 2026, "https://ec.europa.eu/eurostat/web/european-statistics-competition"],
  ]),
  ...grouped("competition", ["工程", "计算机", "工程设计", "科技与创新", "创造"], [
    ["FIRST Robotics Competition", "FIRST", 2026, "https://www.firstinspires.org/robotics/frc"],
    ["FIRST Tech Challenge", "FIRST", 2026, "https://www.firstinspires.org/robotics/ftc"],
    ["VEX Robotics Competition", "VEX", 2026, "https://www.vexrobotics.com/competition"],
    ["World Robot Olympiad", "WRO", 2026, "https://wro-association.org/"],
    ["Future City Competition", "DiscoverE", 2026, "https://futurecity.org/"],
    ["Conrad Challenge", "Conrad Foundation", 2026, "https://www.conradchallenge.org/"],
    ["Technovation Girls Challenge", "Technovation", 2026, "https://technovationchallenge.org/"],
    ["NASA Space Apps Challenge", "NASA", 2026, "https://www.spaceappschallenge.org/"],
  ]),
  ...grouped("competition", ["生物", "化学", "实验探究", "科技与创新", "创造"], [
    ["Regeneron Science Talent Search", "Society for Science", 2026, "https://www.societyforscience.org/regeneron-sts/"],
    ["iGEM Competition", "iGEM Foundation", 2026, "https://competition.igem.org/"],
    ["Breakthrough Junior Challenge", "Breakthrough Prize", 2026, "https://breakthroughjuniorchallenge.org/"],
    ["eCYBERMISSION STEM Challenge", "U.S. Army", 2026, "https://www.ecybermission.com/"],
    ["Envirothon Current Issue", "NCF-Envirothon", 2026, "https://envirothon.org/"],
  ]),
  ...grouped("competition", ["经济", "社会学", "方案设计", "经济与商业", "评价"], [
    ["Blue Ocean Student Entrepreneur Competition", "Blue Ocean Competition", 2026, "https://blueoceancompetition.org/"],
    ["Diamond Challenge", "University of Delaware", 2026, "https://diamondchallenge.org/"],
    ["Wharton Global High School Investment Competition", "Wharton", 2026, "https://globalyouth.wharton.upenn.edu/competitions/investment-competition/"],
    ["HOSA Competitive Events", "HOSA", 2026, "https://hosa.org/competitive-events/"],
  ]),

  ...grouped("pbl_case", ["跨学科", "方案设计", "教育与发展", "创造"], [
    ["PBLWorks Project Library", "PBLWorks", 2026, "https://www.pblworks.org/project-library"],
    ["High Tech High Projects", "High Tech High", 2026, "https://www.hightechhigh.org/projects/"],
    ["EL Education School Models", "EL Education", 2026, "https://eleducation.org/schools-and-districts/school-models"],
    ["Design for Change Global Projects", "Design for Change", 2026, "https://dfcworld.com/"],
    ["World Savvy Resource Hub", "World Savvy", 2026, "https://www.worldsavvy.org/resources/"],
    ["KQED Youth Media Challenge", "KQED", 2026, "https://www.kqed.org/education"],
    ["Code.org CS Discoveries Projects", "Code.org", 2026, "https://code.org/curriculum"],
  ]),
  ...grouped("pbl_case", ["跨学科", "工程设计", "科技与创新", "应用"], [
    ["OpenSciEd Unit Library", "OpenSciEd", 2026, "https://www.openscied.org/"],
    ["TeachEngineering Curriculum", "TeachEngineering", 2026, "https://www.teachengineering.org/"],
    ["MIT App Inventor Resources", "MIT", 2026, "https://appinventor.mit.edu/explore/resources"],
    ["NASA Learning Resources", "NASA", 2026, "https://www.nasa.gov/learning-resources/"],
    ["NOAA Education Resource Collections", "NOAA", 2026, "https://www.noaa.gov/education/resource-collections"],
    ["National Geographic Resource Library", "National Geographic", 2026, "https://education.nationalgeographic.org/resource-library/"],
    ["Smithsonian Learning Lab", "Smithsonian", 2026, "https://learninglab.si.edu/"],
  ]),
  ...grouped("pbl_case", ["社会学", "文献研究", "伦理与治理", "评价"], [
    ["Facing History Resource Library", "Facing History", 2026, "https://www.facinghistory.org/resource-library"],
    ["UNICEF Teaching and Learning Materials", "UNICEF", 2026, "https://www.unicef.org/education/teaching-and-learning-materials"],
    ["OER Project Investigations", "OER Project", 2026, "https://www.oerproject.com/"],
    ["WWF Teaching Resources", "WWF", 2026, "https://www.worldwildlife.org/teaching-resources"],
    ["C3 Framework Inquiry Hub", "NCSS", 2026, "https://www.socialstudies.org/standards/c3"],
    ["Zinn Education Project Teaching Materials", "Zinn Education Project", 2026, "https://www.zinnedproject.org/materials/"],
  ]),

  ...grouped("driving_question", ["经济", "社会学", "数据分析", "城市与社区", "分析"], [
    ["UN Data", "United Nations", 2026, "https://data.un.org/"],
    ["OECD Data", "OECD", 2026, "https://data.oecd.org/"],
    ["IMF Data", "IMF", 2026, "https://www.imf.org/en/Data"],
    ["Eurostat Database", "European Union", 2026, "https://ec.europa.eu/eurostat"],
    ["Our World in Data", "OWID", 2026, "https://ourworldindata.org/"],
    ["Gapminder Data", "Gapminder", 2026, "https://www.gapminder.org/data/"],
    ["World Inequality Database", "WID", 2026, "https://wid.world/data/"],
    ["Data.gov Open Data", "U.S. Government", 2026, "https://www.data.gov/"],
  ]),
  ...grouped("driving_question", ["生物", "社会调研", "健康与医学", "分析"], [
    ["WHO Global Health Observatory", "WHO", 2026, "https://www.who.int/data/gho"],
    ["UNICEF Data", "UNICEF", 2026, "https://data.unicef.org/"],
    ["CDC Data and Statistics", "CDC", 2026, "https://www.cdc.gov/datastatistics/"],
    ["UNHCR Refugee Data", "UNHCR", 2026, "https://www.unhcr.org/refugee-statistics/"],
    ["China CDC Weekly", "中国疾控中心", 2026, "https://weekly.chinacdc.cn/"],
  ]),
  ...grouped("driving_question", ["环境科学", "数据分析", "环境与生态", "分析"], [
    ["FAOSTAT", "FAO", 2026, "https://www.fao.org/faostat/"],
    ["IEA Data and Statistics", "IEA", 2026, "https://www.iea.org/data-and-statistics"],
    ["Global Carbon Project", "GCP", 2026, "https://www.globalcarbonproject.org/"],
    ["OpenAQ Air Quality Data", "OpenAQ", 2026, "https://openaq.org/"],
    ["NOAA Climate Data Online", "NOAA", 2026, "https://www.ncei.noaa.gov/cdo-web/"],
    ["NASA Earth Observatory", "NASA", 2026, "https://earthobservatory.nasa.gov/"],
    ["US EPA Envirofacts", "EPA", 2026, "https://www.epa.gov/enviro"],
    ["USGS Earthquake Catalog", "USGS", 2026, "https://earthquake.usgs.gov/earthquakes/search/"],
  ]),
  ...grouped("driving_question", ["计算机", "数据分析", "科技与创新", "评价"], [
    ["Kaggle Datasets", "Kaggle", 2026, "https://www.kaggle.com/datasets"],
    ["Google Trends", "Google", 2026, "https://trends.google.com/"],
    ["GDELT Project", "GDELT", 2026, "https://www.gdeltproject.org/"],
    ["GitHub Octoverse", "GitHub", 2026, "https://octoverse.github.com/"],
    ["中国气象数据网", "中国气象局", 2026, "https://data.cma.cn/"],
    ["国家自然资源数据", "自然资源部", 2026, "http://www.mnr.gov.cn/"],
    ["中国国家能源数据", "国家能源局", 2026, "http://www.nea.gov.cn/"],
  ]),

  ...grouped("curriculum_map", ["环境科学", "实验探究", "环境与生态", "应用"], [
    ["AP Environmental Science CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-environmental-science"],
  ]),
  ...grouped("curriculum_map", ["地理", "社会调研", "城市与社区", "分析"], [
    ["AP Human Geography CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-human-geography"],
  ]),
  ...grouped("curriculum_map", ["经济", "数据分析", "经济与商业", "分析"], [
    ["AP Macroeconomics CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-macroeconomics"],
    ["AP Microeconomics CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-microeconomics"],
  ]),
  ...grouped("curriculum_map", ["心理学", "社会调研", "健康与医学", "评价"], [
    ["AP Psychology CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-psychology"],
  ]),
  ...grouped("curriculum_map", ["历史", "文献研究", "文化与传承", "分析"], [
    ["AP World History: Modern CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-world-history"],
    ["AP United States History CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-us-history"],
    ["AP Comparative Government and Politics CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-comparative-government-and-politics"],
  ]),
  ...grouped("curriculum_map", ["英语", "文献研究", "教育与发展", "评价"], [
    ["AP English Language and Composition CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-english-language-and-composition"],
    ["AP English Literature and Composition CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-english-literature-and-composition"],
    ["AP Seminar CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-seminar"],
    ["AP Research CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-research"],
  ]),
  ...grouped("curriculum_map", ["数学", "数据分析", "工程设计", "应用"], [
    ["AP Calculus AB CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-calculus-ab"],
    ["AP Calculus BC CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-calculus-bc"],
    ["AP Precalculus CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-precalculus"],
  ]),
  ...grouped("curriculum_map", ["计算机", "工程设计", "科技与创新", "创造"], [
    ["AP Computer Science A CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-computer-science-a"],
  ]),
  ...grouped("curriculum_map", ["艺术", "创意表达", "文化与传承", "创造"], [
    ["AP Art and Design CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-art-and-design"],
  ]),
  ...grouped("curriculum_map", ["物理", "实验探究", "工程设计", "分析"], [
    ["IB DP Physics Guide", "IBO", 2026, "https://www.ibo.org/programmes/diploma-programme/curriculum/sciences/physics/"],
  ]),
  ...grouped("curriculum_map", ["化学", "实验探究", "能源与材料", "应用"], [
    ["IB DP Chemistry Guide", "IBO", 2026, "https://www.ibo.org/programmes/diploma-programme/curriculum/sciences/chemistry/"],
  ]),
  ...grouped("curriculum_map", ["生物", "实验探究", "健康与医学", "分析"], [
    ["IB DP Biology Guide", "IBO", 2026, "https://www.ibo.org/programmes/diploma-programme/curriculum/sciences/biology/"],
  ]),
  ...grouped("curriculum_map", ["经济", "数据分析", "经济与商业", "评价"], [
    ["IB DP Economics Guide", "IBO", 2026, "https://www.ibo.org/programmes/diploma-programme/curriculum/individuals-and-societies/economics/"],
  ]),
  ...grouped("curriculum_map", ["地理", "社会调研", "环境与生态", "分析"], [
    ["IB DP Geography Guide", "IBO", 2026, "https://www.ibo.org/programmes/diploma-programme/curriculum/individuals-and-societies/geography/"],
  ]),
  ...grouped("curriculum_map", ["政治", "社会调研", "伦理与治理", "评价"], [
    ["IB DP Global Politics Guide", "IBO", 2026, "https://www.ibo.org/programmes/diploma-programme/curriculum/individuals-and-societies/global-politics/"],
  ]),
  ...grouped("curriculum_map", ["数学", "数据分析", "工程设计", "分析"], [
    ["IB DP Mathematics Guide", "IBO", 2026, "https://www.ibo.org/programmes/diploma-programme/curriculum/mathematics/"],
  ]),
  ...grouped("curriculum_map", ["计算机", "工程设计", "科技与创新", "创造"], [
    ["IB DP Computer Science Guide", "IBO", 2026, "https://www.ibo.org/programmes/diploma-programme/curriculum/sciences/computer-science/"],
  ]),
  ...grouped("curriculum_map", ["语文", "文献研究", "文化与传承", "分析"], [
    ["普通高中课程方案（2017年版）", "教育部", 2026, "http://www.moe.gov.cn/srcsite/A26/s8001/201801/t20180115_324647.html"],
  ]),
  ...grouped("curriculum_map", ["英语", "文献研究", "教育与发展", "应用"], [
    ["普通高中课程标准修订通知（2020）", "教育部", 2026, "http://www.moe.gov.cn/srcsite/A26/s8001/202006/t20200603_462199.html"],
  ]),
  ...grouped("curriculum_map", ["物理", "实验探究", "工程设计", "应用"], [
    ["普通高中课程标准资源索引", "国家中小学智慧教育平台", 2026, "https://basic.smartedu.cn/"],
  ]),
  ...grouped("curriculum_map", ["政治", "社会调研", "伦理与治理", "评价"], [
    ["普通高中思想政治课程资源", "国家中小学智慧教育平台", 2026, "https://basic.smartedu.cn/"],
  ]),

  ...grouped("pbl_case", ["物理", "实验探究", "工程设计", "应用"], [
    ["PhET Simulation Activities", "University of Colorado Boulder", 2026, "https://phet.colorado.edu/"],
    ["AAPT Physics Teaching Resources", "AAPT", 2026, "https://www.aapt.org/Resources/"],
    ["CERN Education Resources", "CERN", 2026, "https://home.cern/resources"],
  ]),
  ...grouped("pbl_case", ["地理", "社会调研", "环境与生态", "分析"], [
    ["ArcGIS for Schools Resources", "Esri", 2026, "https://www.esri.com/en-us/industries/education/schools"],
    ["NASA Earthdata Learning Resources", "NASA", 2026, "https://www.earthdata.nasa.gov/learn"],
    ["Copernicus Climate Learning", "Copernicus", 2026, "https://climate.copernicus.eu/"],
  ]),
  ...grouped("pbl_case", ["政治", "文献研究", "伦理与治理", "评价"], [
    ["iCivics Teacher Resources", "iCivics", 2026, "https://www.icivics.org/teachers"],
    ["SHEG Reading Like a Historian", "Stanford SHEG", 2026, "https://sheg.stanford.edu/history-lessons"],
    ["UNESCO Global Citizenship Education", "UNESCO", 2026, "https://www.unesco.org/en/global-citizenship-peace-education"],
  ]),
  ...grouped("pbl_case", ["语文", "创意表达", "文化与传承", "创造"], [
    ["National Writing Project Resources", "NWP", 2026, "https://www.nwp.org/"],
    ["中国语言资源保护工程", "教育部", 2026, "https://zhongguoyuyan.cn/"],
  ]),
  ...grouped("pbl_case", ["艺术", "创意表达", "文化与传承", "创造"], [
    ["Met Museum Open Access", "The Met", 2026, "https://www.metmuseum.org/art/collection/search"],
    ["Google Arts & Culture", "Google", 2026, "https://artsandculture.google.com/"],
  ]),

  ...grouped("driving_question", ["心理学", "社会调研", "健康与医学", "分析"], [
    ["WHO Mental Health Atlas", "WHO", 2026, "https://www.who.int/teams/mental-health-and-substance-use/data-research/mental-health-atlas"],
    ["Our World in Data: Mental Health", "OWID", 2026, "https://ourworldindata.org/mental-health"],
    ["Pew Research Social Trends", "Pew Research Center", 2026, "https://www.pewresearch.org/topics/"],
  ]),
  ...grouped("driving_question", ["地理", "数据分析", "环境与生态", "分析"], [
    ["OpenStreetMap Data", "OSM", 2026, "https://www.openstreetmap.org/"],
    ["Global Forest Watch", "WRI", 2026, "https://www.globalforestwatch.org/"],
    ["UNEP Data Explorer", "UNEP", 2026, "https://wesr.unep.org/"],
  ]),
  ...grouped("driving_question", ["政治", "社会调研", "伦理与治理", "评价"], [
    ["中国政府网政策文件库", "中国政府网", 2026, "https://www.gov.cn/zhengce/zuixin.htm"],
    ["UNESCO Institute for Statistics", "UNESCO", 2026, "https://uis.unesco.org/"],
    ["World Justice Project Rule of Law Index", "WJP", 2026, "https://worldjusticeproject.org/rule-of-law-index"],
  ]),

  ...grouped("curriculum_map", ["物理", "实验探究", "工程设计", "分析"], [
    ["AP Physics C: Mechanics CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-physics-c-mechanics"],
    ["AP Physics C: Electricity and Magnetism CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-physics-c-electricity-and-magnetism"],
  ]),
  ...grouped("curriculum_map", ["政治", "社会调研", "伦理与治理", "评价"], [
    ["AP U.S. Government and Politics CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-us-government-and-politics"],
    ["AP European History CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-european-history"],
  ]),
  ...grouped("curriculum_map", ["心理学", "社会调研", "健康与医学", "分析"], [
    ["IB DP Psychology Guide", "IBO", 2026, "https://www.ibo.org/programmes/diploma-programme/curriculum/individuals-and-societies/psychology/"],
  ]),
  ...grouped("curriculum_map", ["艺术", "创意表达", "文化与传承", "创造"], [
    ["AP Art History CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-art-history"],
    ["IB DP Visual Arts Guide", "IBO", 2026, "https://www.ibo.org/programmes/diploma-programme/curriculum/the-arts/visual-arts/"],
  ]),
  ...grouped("curriculum_map", ["语文", "文献研究", "文化与传承", "分析"], [
    ["AP Chinese Language and Culture CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-chinese-language-and-culture"],
  ]),
];

const NIGHT_SHIFT_SOURCE_SEEDS: SourceSeed[] = [
  ...grouped("competition", ["工程", "计算机", "工程设计", "科技与创新", "创造"], [
    ["Zero Robotics Competition", "MIT", 2026, "https://zerorobotics.mit.edu/"],
    ["Odyssey of the Mind Program", "Odyssey of the Mind", 2026, "https://www.odysseyofthemind.com/"],
    ["Destination Imagination Challenges", "Destination Imagination", 2026, "https://www.destinationimagination.org/challenge-experience/"],
    ["Samsung Solve for Tomorrow", "Samsung", 2026, "https://www.samsung.com/us/solvefortomorrow/"],
    ["ExploraVision Competition", "Toshiba/NSTA", 2026, "https://www.exploravision.org/"],
    ["The Earth Prize", "The Earth Foundation", 2026, "https://www.theearthprize.org/"],
    ["CyberPatriot Competition", "Air & Space Forces Association", 2026, "https://www.uscyberpatriot.org/"],
    ["CanSat Competition", "American Astronautical Society", 2026, "https://www.cansatcompetition.com/"],
  ]),
  ...grouped("competition", ["地理", "社会调研", "城市与社区", "分析"], [
    ["International Geography Olympiad", "iGeo", 2026, "https://www.geoolympiad.org/"],
  ]),
  ...grouped("competition", ["语文", "英语", "文献研究", "分析"], [
    ["International Linguistics Olympiad", "IOL", 2026, "https://ioling.org/"],
  ]),

  ...grouped("pbl_case", ["生物", "实验探究", "健康与医学", "分析"], [
    ["HHMI BioInteractive", "HHMI", 2026, "https://www.biointeractive.org/"],
    ["NSTA Classroom Resources", "NSTA", 2026, "https://www.nsta.org/classroom-resources"],
    ["RSC Education Resources", "Royal Society of Chemistry", 2026, "https://edu.rsc.org/resources"],
  ]),
  ...grouped("pbl_case", ["跨学科", "方案设计", "教育与发展", "应用"], [
    ["PBS LearningMedia Collections", "PBS", 2026, "https://www.pbslearningmedia.org/"],
    ["CommonLit 360 Curriculum", "CommonLit", 2026, "https://www.commonlit.org/en/360-program"],
    ["British Council Project Work", "British Council", 2026, "https://www.teachingenglish.org.uk/professional-development/teachers/knowing-subject/articles/project-work"],
    ["UNICEF Climate Education Resources", "UNICEF", 2026, "https://www.unicef.org/climate-action"],
    ["UNHCR Teaching About Refugees", "UNHCR", 2026, "https://www.unhcr.org/teaching-about-refugees.html"],
    ["ESA Education Classroom Resources", "ESA", 2026, "https://www.esa.int/Education"],
    ["NREL Learning Resources", "NREL", 2026, "https://www.nrel.gov/research/education.html"],
    ["Raspberry Pi Classroom Projects", "Raspberry Pi Foundation", 2026, "https://projects.raspberrypi.org/en/projects"],
    ["Google Applied Digital Skills", "Google", 2026, "https://applieddigitalskills.withgoogle.com/"],
  ]),

  ...grouped("driving_question", ["环境科学", "数据分析", "环境与生态", "分析"], [
    ["World Air Quality Index Data", "AQICN", 2026, "https://aqicn.org/data-platform/covid19/"],
    ["IUCN Red List", "IUCN", 2026, "https://www.iucnredlist.org/"],
  ]),
  ...grouped("driving_question", ["经济", "社会学", "数据分析", "城市与社区", "分析"], [
    ["UNDP Human Development Data Center", "UNDP", 2026, "https://hdr.undp.org/data-center"],
    ["UN Women Data Hub", "UN Women", 2026, "https://data.unwomen.org/"],
    ["World Food Programme Hunger Map", "WFP", 2026, "https://hungermap.wfp.org/"],
    ["International Telecommunication Union Statistics", "ITU", 2026, "https://www.itu.int/en/ITU-D/Statistics/Pages/default.aspx"],
  ]),
  ...grouped("driving_question", ["生物", "社会调研", "健康与医学", "分析"], [
    ["Global Health Data Exchange", "IHME", 2026, "https://ghdx.healthdata.org/"],
  ]),
  ...grouped("driving_question", ["历史", "文献研究", "文化与传承", "分析"], [
    ["UNESCO World Heritage List", "UNESCO", 2026, "https://whc.unesco.org/en/list/"],
  ]),
  ...grouped("driving_question", ["计算机", "数据分析", "科技与创新", "分析"], [
    ["OpenAlex Scholarly Metadata", "OpenAlex", 2026, "https://openalex.org/"],
  ]),
  ...grouped("driving_question", ["环境科学", "社会调研", "环境与生态", "分析"], [
    ["National Water Resources Bulletin", "水利部", 2026, "https://www.mwr.gov.cn/sj/"],
  ]),

  ...grouped("curriculum_map", ["英语", "文献研究", "教育与发展", "应用"], [
    ["AP French Language and Culture CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-french-language-and-culture"],
    ["AP Spanish Language and Culture CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-spanish-language-and-culture"],
    ["AP Spanish Literature and Culture CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-spanish-literature-and-culture"],
    ["AP German Language and Culture CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-german-language-and-culture"],
    ["AP Japanese Language and Culture CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-japanese-language-and-culture"],
    ["AP Latin CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-latin"],
  ]),
  ...grouped("curriculum_map", ["艺术", "创意表达", "文化与传承", "创造"], [
    ["AP Music Theory CED", "AP Central", 2026, "https://apcentral.collegeboard.org/courses/ap-music-theory"],
  ]),
  ...grouped("curriculum_map", ["环境科学", "实验探究", "环境与生态", "应用"], [
    ["IB DP Environmental Systems and Societies Guide", "IBO", 2026, "https://www.ibo.org/programmes/diploma-programme/curriculum/sciences/environmental-systems-and-societies/"],
  ]),
  ...grouped("curriculum_map", ["历史", "文献研究", "文化与传承", "分析"], [
    ["IB DP History Guide", "IBO", 2026, "https://www.ibo.org/programmes/diploma-programme/curriculum/individuals-and-societies/history/"],
  ]),
  ...grouped("curriculum_map", ["哲学", "文献研究", "伦理与治理", "评价"], [
    ["IB DP Philosophy Guide", "IBO", 2026, "https://www.ibo.org/programmes/diploma-programme/curriculum/individuals-and-societies/philosophy/"],
  ]),
  ...grouped("curriculum_map", ["英语", "文献研究", "教育与发展", "分析"], [
    ["IB DP Language A: Literature Guide", "IBO", 2026, "https://www.ibo.org/programmes/diploma-programme/curriculum/studies-in-language-and-literature/literature/"],
  ]),
  ...grouped("curriculum_map", ["地理", "社会调研", "环境与生态", "分析"], [
    ["普通高中地理课程资源", "国家中小学智慧教育平台", 2026, "https://basic.smartedu.cn/"],
  ]),
  ...grouped("curriculum_map", ["历史", "文献研究", "文化与传承", "分析"], [
    ["普通高中历史课程资源", "国家中小学智慧教育平台", 2026, "https://basic.smartedu.cn/"],
  ]),
  ...grouped("curriculum_map", ["数学", "数据分析", "工程设计", "应用"], [
    ["普通高中数学课程资源", "国家中小学智慧教育平台", 2026, "https://basic.smartedu.cn/"],
  ]),

  ...grouped("pbl_case", ["跨学科", "方案设计", "教育与发展", "应用"], [
    ["OER Commons Open Library", "OER Commons", 2026, "https://www.oercommons.org/"],
    ["Khan Academy Course Library", "Khan Academy", 2026, "https://www.khanacademy.org/"],
    ["CK-12 FlexBooks", "CK-12 Foundation", 2026, "https://www.ck12.org/flexbooks/"],
  ]),
  ...grouped("curriculum_map", ["计算机", "数学", "工程设计", "应用"], [
    ["MIT OpenCourseWare Portal", "MIT OpenCourseWare", 2026, "https://ocw.mit.edu/"],
    ["MIT OCW 6.0001 Python", "MIT OpenCourseWare", 2026, "https://ocw.mit.edu/courses/6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/"],
  ]),
  ...grouped("curriculum_map", ["数学", "数据分析", "应用", "分析"], [
    ["Khan Academy Math", "Khan Academy", 2026, "https://www.khanacademy.org/math"],
    ["CK-12 Main Portal", "CK-12 Foundation", 2026, "https://www.ck12.org/"],
  ]),

  {
    title: "IB Primary Years Programme (PYP) Public Statement",
    source: "IBO Programmes Public Page",
    year: 2026,
    link: "https://www.ibo.org/programmes/primary-years-programme/",
    type: "curriculum_map",
    tags: ["跨学科", "教育与发展", "方案设计", "应用"],
    presetContent:
      "素材标题：IB Primary Years Programme (PYP) Public Statement\n\n来源机构：IBO Programmes Public Page\n\n原始链接：https://www.ibo.org/programmes/primary-years-programme/\n\n页面摘要：根据 IBO programmes 公开页面，PYP 被描述为终身学习旅程的起点，面向 3-12 岁学习者，强调培养关怀意识与文化理解力，并鼓励学生成为主动学习者。页面公开信息还给出该项目首次推出时间为 1997 年。\n\n教学使用建议：可用于小学阶段项目式学习设计时的目标对齐，尤其适合“学习者主动性”“跨文化理解”“探究式课堂组织”三个维度。",
  },
  {
    title: "IB Middle Years Programme (MYP) Public Statement",
    source: "IBO Programmes Public Page",
    year: 2026,
    link: "https://www.ibo.org/programmes/middle-years-programme/",
    type: "curriculum_map",
    tags: ["跨学科", "教育与发展", "分析", "应用"],
    presetContent:
      "素材标题：IB Middle Years Programme (MYP) Public Statement\n\n来源机构：IBO Programmes Public Page\n\n原始链接：https://www.ibo.org/programmes/middle-years-programme/\n\n页面摘要：根据 IBO programmes 公开页面，MYP 以建立坚实学术基础为核心，强调学生管理自身学习过程的能力，并强化课堂学习与真实世界之间的连接。公开页面给出的年龄范围是 11-16 岁，首次推出时间为 1994 年。\n\n教学使用建议：适合作为初中/高中低年级项目设计依据，重点用于“真实问题连接”“学科迁移”“学习过程管理”三类任务指标。",
  },
  {
    title: "IB Diploma Programme (DP) Public Statement",
    source: "IBO Programmes Public Page",
    year: 2026,
    link: "https://www.ibo.org/programmes/diploma-programme/",
    type: "curriculum_map",
    tags: ["跨学科", "文献研究", "教育与发展", "分析"],
    presetContent:
      "素材标题：IB Diploma Programme (DP) Public Statement\n\n来源机构：IBO Programmes Public Page\n\n原始链接：https://www.ibo.org/programmes/diploma-programme/\n\n页面摘要：根据 IBO programmes 公开页面，DP 被定义为面向未来能力的项目，突出探究精神、持续学习动机与学术/职业发展准备。公开信息显示适用年龄为 16-19 岁，首次推出时间为 1968 年。\n\n教学使用建议：可用于高中高年级项目生成中的学术规范、研究设计与展示答辩要求设定，适合映射到“高阶思维 + 证据论证 + 长周期任务”框架。",
  },
  {
    title: "IB Career-related Programme (CP) Public Statement",
    source: "IBO Programmes Public Page",
    year: 2026,
    link: "https://www.ibo.org/programmes/career-related-programme/",
    type: "curriculum_map",
    tags: ["跨学科", "工程设计", "教育与发展", "应用"],
    presetContent:
      "素材标题：IB Career-related Programme (CP) Public Statement\n\n来源机构：IBO Programmes Public Page\n\n原始链接：https://www.ibo.org/programmes/career-related-programme/\n\n页面摘要：根据 IBO programmes 公开页面，CP 面向学生高中阶段后期，强调未来技能、职业路径准备，以及学术课程与职业兴趣的整合。公开页面显示其适用年龄为 16-19 岁，首次推出时间为 2012 年。\n\n教学使用建议：适合用于职业导向型项目生成，特别是“学术-职业融合任务”“真实行业情境题”“成果转化与路径规划”类项目。",
  },
];

const SOURCE_SEEDS: SourceSeed[] = [
  ...BASE_SOURCE_SEEDS,
  ...ADDITIONAL_SOURCE_SEEDS,
  ...NIGHT_SHIFT_SOURCE_SEEDS,
];

function loadExistingContentMap(filePath: string) {
  if (!existsSync(filePath)) return new Map<string, string>();

  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8")) as Array<{
      id?: string;
      content?: string;
      originalContent?: string;
    }>;
    const map = new Map<string, string>();

    raw.forEach((item) => {
      if (!item?.id) return;
      const text = item.originalContent ?? item.content;
      if (typeof text !== "string") return;
      const normalized = text.trim();
      if (!normalized) return;
      map.set(item.id, normalized);
    });

    return map;
  } catch {
    return new Map<string, string>();
  }
}

function buildMaterials(existingContent: Map<string, string>): MaterialSeed[] {
  return SOURCE_SEEDS.map((item, index) => {
    const id = `M${String(index + 1).padStart(3, "0")}`;
    const content = existingContent.get(id) ?? item.presetContent;
    const rest: Omit<SourceSeed, "presetContent"> = {
      title: item.title,
      source: item.source,
      year: item.year,
      link: item.link,
      type: item.type,
      tags: item.tags,
    };

    return {
      id,
      ...rest,
      content,
      originalContent: content,
    };
  });
}

function toMarkdown(materials: MaterialSeed[]) {
  const rows = materials
    .map(
      (item) =>
        `| ${item.id} | ${item.title} | ${item.type} | ${item.source} | ${item.year} | ${item.tags.join(" / ")} | ${item.link} |`,
    )
    .join("\n");

  return `# PBL 素材采集清单（初始化）

> 本文件由 scripts/pbl/collect-materials.ts 生成。

| 编号 | 标题 | 类型 | 来源 | 年份 | 标签 | 链接 |
|------|------|------|------|------|------|------|
${rows}
`;
}

function main() {
  const dataDir = resolve(process.cwd(), "data/pbl");
  const docsDir = resolve(process.cwd(), "docs/pbl");
  const dataFile = resolve(dataDir, "materials.collected.json");

  mkdirSync(dataDir, { recursive: true });
  mkdirSync(docsDir, { recursive: true });

  const existingContent = loadExistingContentMap(dataFile);
  const materials = buildMaterials(existingContent);

  writeFileSync(dataFile, JSON.stringify(materials, null, 2));
  writeFileSync(resolve(docsDir, "materials-catalog.md"), toMarkdown(materials));

  console.log(`Collected ${materials.length} materials.`);
}

main();
