我已经完整阅读了所有 PDF 内容。现在基于深度分析，输出结构化的出题模式手册。

---

# AP 统计学 CB 出题者模式手册

基于 College Board 官方题库（questionbank MCQ/FRQ）和 Progress Check（Unit 1-9）的系统分析

---

## 第一部分：MCQ 出题模式分析

### 一、题干结构分类

CB 的 MCQ 题干遵循 **五种固定模式**，按出现频率排序：

| 模式 | 占比（估计） | 典型开头 | 示例 |
|------|-----------|---------|------|
| **情景引入型** | ~45% | "A researcher/company/student..." | 给出完整实验/调查背景，再提问 |
| **数据/图表引入型** | ~25% | 给出直方图/表格/boxplot/散点图，然后提问 | "The histogram above shows..." |
| **概念直问型** | ~15% | "Which of the following..." | 直接考定义/性质，无背景 |
| **计算应用型** | ~10% | 给出 mean/SD/n 等数值 | 要求选择正确的公式表达式或区间 |
| **多步骤共享情景型** | ~5% | "The following question(s) refer to the following scenario" | 一段长背景 + 多道题共享 |

**关键发现**：CB 极少出"裸概念"题。即使考概念定义（如标准差的含义），也会包裹在一个真实情景中（如"公司统计员工病假天数"）。

### 二、选项设计的干扰策略

CB 设计干扰项的 **六大固定手法**：

#### 1. 概念偷换（最常见）
- 用 "population" 替换 "sample"，或反过来
- 用 x-bar (样本统计量) 替换 mu (总体参数)
- 例：假设检验中 H0 写成关于 x-bar 而非 mu

#### 2. 方向/符号混淆
- 左偏 vs 右偏
- Ha: mu > vs mu <
- one-sided vs two-sided
- 例：题目说"怀疑均值**大于**38"，干扰选项给 Ha: mu < 38

#### 3. 数值陷阱
- 公式中用 sigma 还是 sigma/sqrt(n)
- z* 和 t* 的混用
- 自由度 n-1 vs n vs n-2
- 例：置信区间用 1.96（z）还是 2.262（t），取决于是否知道总体标准差

#### 4. 解释性错误（置信区间/p值的经典误区）
- "95%的数据落在区间内" -- 错误
- "有0.95的概率总体均值在区间内" -- 错误
- "如果重复抽样，约95%的区间包含总体均值" -- 正确
- CB 每套卷至少 3-5 题考这类"正确解释"

#### 5. 推断条件遗漏
- 随机抽样条件 vs 样本量条件 vs 独立性条件
- 正态性判断：小样本需要图形检查 vs 大样本CLT
- 非随机样本 = 不满足推断条件（最常见的"No"答案原因）

#### 6. Simpson 悖论 / 加权平均陷阱
- 分组时每组都低，合并后可能反转
- 例：物理和化学 GPA 表格，每个年级化学都高，但整体物理可能更高

### 三、认知层次分布

| 层次 | 占比 | 典型题型 |
|------|------|--------|
| **记忆** | ~10% | 连续变量 vs 离散变量的判断；抽样方法名称辨识 |
| **理解** | ~35% | 置信区间/p值的正确解释；标准差的概念解释；偏度与均值/中位数关系 |
| **应用** | ~35% | 选择正确的检验方法；计算置信区间的 margin of error；从图表读数据 |
| **分析** | ~20% | 判断推断条件是否满足；评估实验设计的缺陷；Simpson 悖论 |

### 四、统计学特有 MCQ 题型模板

#### 模板 1：「选择正确检验方法」(Unit 7-9 高频)
```
情景描述（实验/调查） → "Which of the following is the most appropriate test/procedure?"
选项：one-sample z, one-sample t, two-sample t, matched-pairs t, chi-square
```
**出题要素**：
- 一组 vs 两组？→ one-sample vs two-sample
- 配对 vs 独立？→ matched-pairs vs two-sample
- 均值 vs 比例？→ t-test vs z-test
- 分类数据？→ chi-square

#### 模板 2：「写出正确假设」(Unit 7-8 高频)
```
"A researcher believes/claims that [具体声明]. Which of the following is the correct set of hypotheses?"
```
**干扰手法**：
- H0 用 x-bar 而非 mu（错误）
- Ha 方向反了
- H0 不等于某值（错误，H0 永远是等号）
- 用样本值而非声称值

#### 模板 3：「置信区间的正确解释」(每套必考 2-3 道)
```
"A 95% confidence interval is (a, b). Which of the following is a correct interpretation?"
```
**正确答案模板**：
- "We are 95% confident that the **population** [parameter] is between a and b"
- 或 "约95%的此类区间将包含总体参数"

**必错选项**：
- "95%的数据/样本/个体在区间内"
- "概率是0.95总体均值在区间内"
- 把"population"换成"sample"

#### 模板 4：「推断条件检查」(Unit 7 高频)
```
情景 + 样本信息 → "Have the conditions for inference been met?"
```
**判断逻辑**：
1. 随机性：是否 random sample/random assignment？
2. 独立性：n < 10% of N？
3. 正态性：n >= 30 用 CLT；n < 30 看图形是否对称无outlier

#### 模板 5：「图表解读」(Unit 1 高频)
```
给出 histogram/boxplot/stemplot/dotplot → "Which of the following statements is true/supported?"
```
**考察重点**：
- 形状识别（对称/偏态/双峰/均匀）
- 中心和spread的比较
- IQR/中位数/均值的读取
- outlier 的识别

### 五、Stimulus（数据呈现）类型

| 数据形式 | 出现场景 | 考察目的 |
|---------|---------|---------|
| **直方图** | Unit 1（形状/中心/spread）; Unit 5（抽样分布） | 形状识别、中位数定位、IQR估算 |
| **箱线图** | Unit 1（比较分布）; Unit 7（实验效果） | IQR、outlier、分布比较 |
| **茎叶图** | FRQ（配对差异展示） | 读取数据、判断中心偏向 |
| **点图 (Dotplot)** | FRQ（模拟分布/差异分布） | 估计p值、判断中心趋势 |
| **散点图** | Unit 2/9（回归） | 关系描述、残差分析 |
| **双向频率表** | Unit 1/3（分类数据） | 条件概率、关联判断 |
| **分段柱状图** | Unit 1/FRQ | 条件分布比较 |
| **正态曲线** | Unit 5（概率/百分位数） | z-score计算 |
| **汇总统计表** | Unit 7-8（推断） | 选择检验、计算区间 |
| **模拟分布** | FRQ（bootstrap/randomization） | 估计p值 |
| **频率表/累积频率表** | Unit 1（大数据集） | 百分位数、IQR计算 |

---

## 第二部分：FRQ 出题模式分析

### 一、FRQ 的三种固定类型

根据 CB 官方题库分析，FRQ 严格分为以下三类：

#### 类型 A：探索数据 + 抽样/实验设计（Investigative Task 风格）
- **结构**：3-4 个 part，递进关系弱，各 part 相对独立
- **典型要素**：描述分布、比较分布、选择图形、评估抽样方法
- **代表题**：TB_frq1 Q1（租金分布+bootstrap）、Q2（道路垃圾调查+分层抽样）、Q3（飓风损害+排名检验）

#### 类型 B：统计推断（Hypothesis Test + Confidence Interval）
- **结构**：4-6 个 part，强递进关系
- **典型要素**：陈述假设 → 检验条件 → 计算 → 结论
- **代表题**：TB_frq1 Q5（劳动参与率z-test）、Q11（教练预测能力比较）

#### 类型 C：概率与随机变量 + 推断混合
- **结构**：6 个 part (a-f)，前半部分数据解读，后半部分概率/分布
- **这是 CB 近年的主力 FRQ 模板**
- **代表题**：TB_frq1 Q6-Q10（全部遵循完全相同的6-part结构）

### 二、近年主力 FRQ 模板详解（类型 C：六步模板）

这是 CB 最重要的 FRQ 创新，**在题库中反复出现至少 5 次**（Q6牛油果/Q7猫牙/Q8雀鸟/Q9玫瑰/Q10狗毛），结构完全一致：

```
实验背景：研究者调查某处理（肥料/补充剂/温度等）的效果
数据呈现：stemplot 或 dotplot 展示配对差异

(a) 解释正/负差异在情景中的含义
    "A positive difference indicates that [without treatment] had more [outcome] 
     than [with treatment] for that pair"

(b) 仅基于样本数据，不做推断，判断处理是否有效
    → 看数据中心偏向哪一侧、正/负值个数
    → 必须引用具体数据特征（如"majority of differences are positive"）

(c) 用文字陈述适当检验的假设
    → H0: 处理没有效果（均值差=0）
    → Ha: 处理有效果（均值差方向性，单侧）
    → 必须用"in words"，不能只写符号

(d) 给定p值和alpha=0.05，做出结论
    → 如果 p < 0.05: "reject H0, convincing evidence..."
    → 如果 p > 0.05: "fail to reject H0, NOT convincing evidence..."
    → 必须联系决策者的具体行动（如"the owner would/would not introduce..."）

(e) 计算并解释二项分布的均值
    → 从数据中确定"成功"概率 p（如正差异的比例）
    → mu = np
    → 解释："在[n]次随机选择中，预期有[mu]个具有[特征]的对象"

(f) 修改情景使随机变量变为几何分布
    → "Instead of selecting [n] at a time, select one at a time until 
        the first [特征] is obtained"
    → 将"固定次数中的成功数"改为"直到第一次成功的试验数"
```

### 三、其他高频 FRQ 模板

#### 模板 D：比例推断 FRQ（Unit 5/8）
```
(a) 计算样本比例或比例差
(b) 计算抽样分布的均值和标准差
(c) 验证正态近似条件（np >= 10, n(1-p) >= 10）
(d) 计算概率（使用正态分布）
```
代表题：Unit 5 Progress Check FRQ Q1（海龟比例差）

#### 模板 E：分类数据比较 FRQ
```
(a) 计算并比较各组的相对频率
(b) 从图形描述关联/差异
(c) 给出统计理由选择某组
(d-f) 假设检验：命名检验 → 陈述假设 → 检验条件 → 结论
```
代表题：TB_frq1 Q11（教练预测）、Q12（自驾软件）

#### 模板 F：回归推断 FRQ（Unit 9）
```
(a) 画散点图，判断线性是否合适
(b) 计算最小二乘回归线
(c) 写出适当假设（H0: beta1 = 0 vs Ha: beta1 ≠ 0）
(d) 给定 t 统计量，做出关于线性关系的结论
```
代表题：Unit 9 Progress Check FRQ

#### 模板 G：数据探索 + bootstrap FRQ
```
(a) 描述样本可推广的总体
(b) 解释为什么中位数比均值更合适（偏态数据）
(c) 描述如何构建抽样分布（理论方法 or bootstrap）
(d) 从bootstrap频率表读百分位数
(e) 计算百分位数之间的比例
(f) 构建并解释置信区间
```
代表题：TB_frq1 Q1（租金bootstrap）

### 四、FRQ 评分关键词要求

基于题目结构分析，CB 评分的核心"得分点关键词"如下：

#### 分布描述题的必需元素（SOCS）
- **S**hape：symmetric / skewed left / skewed right / bimodal / uniform
- **O**utliers：identify any outliers
- **C**enter：mean / median（给出估计值）
- **S**pread：range / IQR / standard deviation（给出估计值）
- **必须使用 context**：不能只说"skewed right"，要说"the distribution of [变量名] is skewed right"

#### 假设检验结论的必需元素
1. **比较**：p-value 与 alpha 的大小关系（"Because p = 0.019 < alpha = 0.05..."）
2. **决定**：reject 或 fail to reject H0
3. **情景化结论**：用研究背景语言（不能只说"reject H0"）
4. **回答决策问题**：如果题目问"would the owner..."，必须直接回答 yes/no

#### 置信区间解释的必需元素
1. **置信水平**：We are [95%] confident that...
2. **总体参数**：population mean / true proportion（不能说 sample）
3. **区间范围**：is between [a] and [b]
4. **情景**：用具体变量名称

#### 条件检查的必需元素
每个条件必须：
1. **命名**条件
2. **解释**为什么满足/不满足
3. 给出**具体证据**（如 "n = 40 > 30, so CLT applies"）

### 五、FRQ 递进关系模式

| 递进类型 | 特征 | 示例 |
|---------|------|------|
| **独立型** | 各 part 互不依赖，错一个不影响后面 | Q7 campground（直方图读数/比较/估计中位数） |
| **弱递进型** | 后面的 part 可以独立得分，但逻辑上是延续 | 六步模板(a)→(b)→(c)→(d)各自独立评分 |
| **强递进型** | 后面的 part 必须用到前面的答案 | bootstrap题：(d)算百分位→(e)算比例→(f)构建区间 |
| **分支型** | 一个情景衍生出不同方向的问题 | Q2道路垃圾：抽样方法→估计方法→加权平均 |

---

## 第三部分：九大 Unit 出题重点对照

| Unit | 核心主题 | MCQ 高频考点 | FRQ 高频考点 |
|------|--------|-----------|-----------|
| **1** | 探索数据 | 形状识别、IQR/SD比较、均值vs中位数、线性变换效应、Simpson悖论 | 描述分布(SOCS)、比较分布、画图 |
| **2** | 双变量 | 散点图解读、回归线解释、r vs r^2、残差图 | 回归预测、残差分析 |
| **3** | 收集数据 | SRS/分层/整群/系统抽样辨识、偏差来源、总体识别 | 设计实验、解释抽样方法 |
| **4** | 实验设计 | 处理/实验单位/响应变量辨识、随机化目的、confounding | 设计完整实验方案 |
| **5** | 抽样分布 | CLT、抽样分布的均值和标准差、正态近似条件 | 计算抽样分布参数、概率计算 |
| **6** | 概率 | 独立性、条件概率、二项/几何分布 | 概率计算、分布参数计算 |
| **7** | 均值推断 | 选择z/t、构建CI、解释CI、条件检查 | 构建区间+解释、选择方法 |
| **8** | 比例推断 & 假设检验 | 写假设、识别检验类型、解释p值、Type I/II error | 完整假设检验流程 |
| **9** | 回归推断 | 回归斜率检验、t统计量、线性关系判断 | 散点图→回归线→假设检验→结论 |

---

## 第四部分：可复用的出题模板

### MCQ 出题模板库

#### 模板 M1：图表形状识别
```
[提供 2-4 个直方图/点图]
Which of the following shapes is [NOT represented / best described]?
(A) Uniform  (B) Bimodal  (C) Skewed left  (D) Skewed right  (E) Symmetric and unimodal
```

#### 模板 M2：统计量变换
```
[数据经过线性变换: Y = aX + b]
Which of the following is [true / NOT true] about the transformed data?
关键规律：均值/中位数: a*原值+b  |  SD/IQR/range: |a|*原值  |  形状不变
```

#### 模板 M3：异常值修正后的统计量变化
```
The [highest/lowest] value was corrected. Which statistic must have remained the same?
关键规律：中位数通常不变（极端值修正）；均值和标准差会变
```

#### 模板 M4：选择正确推断方法
```
[实验/调查描述] → "Which is the most appropriate procedure?"
决策树：
  量化数据？→ 是：一组(one-sample t) vs 两组(two-sample t) vs 配对(matched-pairs t)
  分类数据？→ 是：一组(one-sample z for p) vs 两组(two-sample z for p差) vs 列联表(chi-square)
```

#### 模板 M5：CI/p值正确解释
```
[给出区间或p值] → "Which is a correct interpretation?"
正确选项模板：
  CI: "We are [X]% confident that the [population parameter] is between [a] and [b]"
  p-value: "If H0 is true, the probability of getting a result as extreme as observed is [p]"
```

#### 模板 M6：条件检查
```
[给出样本信息] → "Have conditions for inference been met?"
必查三条件：Random（随机性）、Independent/10%（独立性）、Normal（正态性/大样本）
最常见的"No"原因：非随机抽样（convenience sample）
```

### FRQ 出题模板库

#### 模板 F1：六步推断+概率混合题（CB 主力模板）
```
背景：配对实验，n个对象，each measured before/after
数据呈现：差异值的 stemplot 或 dotplot

(a) 解释差异方向的含义 [1分]
(b) 仅从数据判断效果，不做推断 [2分]
(c) 用文字写假设 [2分]
(d) 给定p值，做结论+回答决策 [2分]
(e) 计算二项分布均值并解释 [2分]
(f) 修改情景为几何分布 [1分]
```

#### 模板 F2：两组比较 + 推断题
```
背景：比较两组分类数据的准确率/比例
数据呈现：双向表 + 分段柱状图

(a) 比较各组相对频率 [2分]
(b) 描述图形中的关联模式 [2分]
(c) 给出选择某组的统计理由 [1分]
(d) 命名检验并写假设 [2分]
(e) 陈述并验证条件 [2分]
(f) 给定检验统计量，做结论 [2分]
```

#### 模板 F3：数据探索 + 高级统计方法
```
背景：调查/收集数据
数据呈现：直方图 + 数据表

(a) 描述总体 [1分]
(b) 解释为什么某统计量更合适（如中位数vs均值） [2分]
(c) 描述如何构建抽样分布（理论或bootstrap） [3分]
(d-f) 使用抽样分布构建置信区间 [4分]
```

---

## 第五部分：核心出题规律总结

### 规律 1：情景真实性
CB 所有题目都嵌入真实世界情景（农业、医学、教育、环保、运动、消费等）。纯抽象数学题几乎不存在。

### 规律 2：概念理解 > 计算能力
计算量极小（多数给出计算结果让学生解释）。重点考察：
- 能否正确**解释**统计结论
- 能否正确**选择**方法
- 能否正确**判断**条件

### 规律 3：干扰项的系统性
每道题的 5 个选项覆盖**学生最常犯的 4 种错误** + 1 个正确答案。干扰项不是随机的，而是基于教学经验中的常见误区设计。

### 规律 4：Unit 7-8-9 是出题密度最高区域
推断（置信区间 + 假设检验）占 MCQ 总量的 40%+ 和 FRQ 的 60%+。

### 规律 5：FRQ 遵循严格模板
近年 FRQ 高度模板化，尤其是六步混合题（推断+概率）几乎每年必考。掌握模板 = 掌握评分。

### 规律 6：正确解释是最大区分度来源
同一个概念反复从不同角度考"正确解释"：
- 置信水平的含义（不是"概率为0.95"）
- p值的含义（不是"H0为真的概率"）
- 抽样分布的含义（重复抽样产生的统计量分布）

### 规律 7：每道 FRQ 必须有 context
FRQ 评分中，"in context" 是独立的得分点。没有情景语言 = 扣分。即使统计方法完全正确，缺少"in the context of [变量名]" = 不满分。

---

以上就是基于 CB 官方题库的完整出题模式分析手册。这些模板可直接用于：
1. 出题时参照 CB 的固定结构
2. 教学时让学生熟悉常见套路
3. 复习时针对性练习高频题型