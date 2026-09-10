

我已经完成了对所有 PDF 文件的深度阅读。现在来综合分析并输出最终的出题模式手册。

---

# AP 微观经济学 CB 出题者模式手册

*基于 College Board 官方 Question Bank（6 个 Unit）和 Progress Check（6 个 Unit）的系统性分析*

---

## 第一部分：MCQ 出题模式深度分析

### 一、题干结构分类（六大类型）

**类型 1：直接概念提问（约 30%）**

最基础的出题方式，直接考查定义、关系、特征。

模板：
- "Which of the following is [概念]?"
- "A monopolist's demand curve is necessarily..."
- "The marginal revenue product of labor is the..."
- "[概念] is inefficient because..."

典型例子：
- "Which of the following is a source of monopoly power?" (Q5, Monopoly MCQ)
- "A firm's demand for labor is known as a derived demand because..." (Q6, Unit 5)
- "An individual's labor supply curve is derived from that person's preferences about the trade-off between income and..." (Q11, Unit 5)

**类型 2：图表读取题（约 35% -- 最高频）**

CB 最偏爱的出题方式。提供一张经济学图（MC/ATC/D/MR 等曲线），要求识别面积、交点、均衡。

模板格式：
```
"The following questions refer to the [graph/diagram] below, which shows [图表描述]."
[图表]
"[问题]"
```

核心图表类型：
| 图表类型 | 涉及曲线 | 典型问法 |
|---------|---------|--------|
| 垄断利润最大化图 | MC, ATC, D, MR | "The economic profit is given by area..." |
| 完全竞争企业图 | MC, ATC, AVC, P (水平线) | "Given price P4, what is the profit-maximizing quantity?" |
| LRATC 包络线图 | 多条 SRATC + LRATC | "The firm's minimum efficient scale occurs on..." |
| 劳动市场图 | MRP, Supply, (MFC) | "The profit-maximizing quantity of labor is..." |
| 外部性图 | MSC, MPC, MSB, MPB, D, MR | "Identify the socially optimal quantity" |

关键观察：
- 图表题**必定**在选项中使用图上标注的字母/下标（如 P1, Q2, area BJE）
- 同一张图通常配 2-4 道题（"The following questions refer to..."）
- 面积识别题是高频陷阱区（consumer surplus / producer surplus / deadweight loss / economic profit）

**类型 3：数据表格计算题（约 15%）**

提供数值表格，要求计算边际量或做决策。

两种核心表格：
1. **成本/收入表**：Quantity - Total Revenue - Total Cost（或 Quantity - Total Cost）
2. **生产函数表**：Number of Workers - Total Product（/Output）

典型问法：
- "The marginal revenue of the third unit is..." (需要做差)
- "The marginal revenue product of the fifth worker is..." (需要先算 MP 再乘以 P)
- "How many workers should the firm hire to maximize profit?" (需要比较 MRP 和 wage)
- "Calculate the average fixed cost of producing 2 units." (需要 FC = TC(0))

CB 的陷阱设计：
- 选项中**一定**包含"总量"作为干扰项（如 MRP 问 $40，选项里放 $240 = Total Product x Price）
- 选项中包含"平均"而非"边际"的混淆值
- 选项中包含少算/多算一个单位的差值

**类型 4：情景引入 + 推理题（约 10%）**

给出一个具体经济场景，要求推导结果。

模板：
```
"Assume that [市场/企业/政策的假设条件]. [变化事件]. Which of the following will [结果]?"
```

典型例子：
- "In the current labor market, suppose that the wage rate for accountants is significantly higher than the wage rate for economists. In the long run, if you observed that..." (Q1, Unit 5)
- "Assume the market for disposable coffee cups is in equilibrium and disposable coffee cups are inputs for serving brewed coffee. Which of the following will result in a higher short-run equilibrium price..." (Q3, Unit 5)
- "Businesses employ workers from city neighborhoods and rural areas... The government offers businesses a wage subsidy if they hire workers from city neighborhoods. What is the effect on..." (Q16, Unit 5)

**类型 5：比较分析题（约 5%）**

要求比较两种市场结构或两种状态。

模板：
- "Compared with a perfectly competitive industry with the same demand and cost curves, a monopoly's price and output will be which of the following?"
- "Compared to a perfectly competitive market, a single-price monopoly with the same market demand and cost curves will..."

选项格式几乎固定为 **二维表格**（Price + Output 各有 Increase/Decrease/No change）。

**类型 6：否定提问（EXCEPT/NOT）（约 5%）**

模板：
- "A change in which of the following will NOT cause a shift in the demand curve for..."
- "As the population of a country ages... the health care industry is likely to experience all of the following EXCEPT"
- "In a perfectly competitive labor market for nurses, all of the following statements are true EXCEPT"

CB 使用规则：
- "EXCEPT"/"NOT" 在题干中一定**大写加粗**
- 这类题实质是找"唯一不正确/不相关"的选项
- 4 个正确 + 1 个例外

### 二、选项设计手法（干扰项工程学）

**手法 1：维度混淆表格**

CB 最具标志性的选项格式——把 Price 和 Output（或 Wage 和 Employment）做成 5 个二维表格：

```
     Price    Output
(A)  Increase  Increase
(B)  Increase  Decrease
(C)  Increase  No change
(D)  Decrease  Increase
(E)  Decrease  Decrease
```

出现频率极高，覆盖所有"双变量变动方向"的题目。学生必须两个维度都判断正确。

**手法 2：面积标签混淆**

图表题中，5 个选项提供 5 种不同的面积字母组合：
- 正确答案如 "P1BCP0"
- 干扰项可能是 "P1BJF"（用了利润相关面积替代 PS）
- 或 "P1BQ10"（用了总收入面积）

学生必须精确理解每个面积的经济学含义。

**手法 3：因果链断裂**

选项描述一个看似合理的因果链，但在某一步出错：
- 正确：demand for product increases -> MRP shifts right -> demand for labor increases -> wage increases
- 干扰：demand for product increases -> supply of labor shifts right（因果链断裂，跳步）

**手法 4："总量 vs 边际量"陷阱**

在计算题中：
- 正确答案是 marginal product = 4 units
- 干扰项包含 total product = 24 units
- 另一个干扰项是 average product = 8 units

**手法 5：短期 vs 长期混淆**

一个选项在短期正确但长期不正确（或反之）：
- "The firm earns economic profits in the long run"（完全竞争下长期为零利润）
- 题目问的是"high barriers to entry"的行业（可以长期保持利润）

### 三、认知层次分布

| 层次 | 占比（估计） | 典型操作 |
|------|-----------|--------|
| **记忆** | ~10% | 定义题："Which is a source of monopoly power?" |
| **理解** | ~25% | 关系题："A monopolist's demand curve is necessarily..." |
| **应用** | ~40% | 计算+图表读取题："The MRP of the 3rd worker is..." |
| **分析** | ~25% | 多步推理题："If steel imports increase, what happens to the labor market for steelworkers?" |

CB 明显偏重**应用**和**分析**层，纯记忆题非常少。

### 四、Stimulus（素材）使用规律

| Stimulus 类型 | 使用频率 | 配题数 |
|-------------|--------|------|
| 经济学曲线图（MC/ATC/D/MR 等） | 极高 (~40% 的题) | 通常 2-4 题/图 |
| 数据表格（Production Function / Cost Schedule） | 高 (~20%) | 通常 2-3 题/表 |
| 文字情景（无图无表） | 中 (~35%) | 1 题/情景 |
| 博弈矩阵（Payoff Matrix） | 低（仅 Oligopoly 单元） | 2-3 题/矩阵 |

---

## 第二部分：FRQ 出题模式深度分析

### 一、两类 FRQ 的区分

CB 微观经济学 FRQ 有两种明确类型：

| 维度 | **长问答（Long FRQ）** | **短问答（Short FRQ）** |
|------|---------------------|---------------------|
| 分值 | 10 分 | 5 分 |
| 时长 | ~25 min | ~12 min |
| Part 数 | 4-7 个 part（常含嵌套 i/ii/iii） | 3-5 个 part |
| 画图 | 几乎必须 | 偶尔要求 |
| 情境复杂度 | 多环节递进 | 单一分析 |

### 二、FRQ 的标准结构模板

**模板 A：完全竞争企业分析（最高频）**

结构固定度极高，几乎是"填空式"的：
```
[给出成本数据表或图]
(a) Calculate [AFC / ATC / MC] of producing X units. Show your work.
(b) Identify the profit-maximizing quantity. Explain using marginal analysis.
(c) Calculate the economic profit at the profit-maximizing quantity. Show your work.
(d) Based on your answer to (c), will the number of firms [increase/decrease/stay the same] in the long run? Explain.
(e) Based on your answer to (c), will the market price [increase/decrease/stay the same] in the long run? Explain.
```

变体延伸（常加 1-2 个高阶问题）：
- "(f) The income elasticity of demand for Good S is -0.5, and the cross-price elasticity... Based on your answer to (e), what will happen to the demand for toy robots?"
- "(g) Suppose shipping costs decrease. Will the profit-maximizing quantity... increase/decrease/stay the same?"

**模板 B：要素市场/劳动市场分析（Unit 5 核心模板）**

出现了**极其标准化**的四部曲结构：
```
[给出 short-run production function 表格：Number of Workers - Total Product]

(a) After which [worker type] do diminishing marginal returns begin? Explain using numbers.
(b) Assume [firm] sells in a perfectly competitive market at a price of $X. Calculate the marginal revenue product of the [N]th [worker type]. Show your work.
(c) [Firm] hires [workers] at a wage rate of $W. How many [workers] will [firm] hire to maximize profit? Explain using marginal analysis.
(d) Assume [外部变化：demand shift / substitute input price change / technology change]. What will happen to each of the following?
    (i) [Wage rate / Marginal factor cost]. Explain.
    (ii) [Demand curve / MRP curve for the firm]. Explain.
```

这个模板被**几乎原样复制**了至少 10 次以上（仅改变企业名称和数字）：
- Michelle's Accounting Company（bookkeepers）
- Ahmal's Manufacturing Company（machinists）
- Bobby's Bakehouse（bakers）-- 垄买市场变体
- Bob's Barber Shop（barbers）
- Camila's Convenience Store（clerks）
- Briana's Brick Shop（brick masons）
- Phyliss's Carpentry Contractors（carpenters）
- Chukwuma's Salon（stylists）
- Esther's Travel Agency（travel agents）
- Denice's Diner（cooks）
- Kayla's Construction Firm（construction workers）

**模板 C：垄断/不完全竞争分析**

```
[情境描述 + 图表]
(a) Draw a correctly labeled graph showing:
    (i) Profit-maximizing quantity, labeled Q_M
    (ii) Profit-maximizing price, labeled P_M
(b) For each firm, explain the relationship between price and marginal revenue.
(c) For each firm, explain how the economic profits would most likely change in the long run.
(d) Label the area that represents the deadweight loss. Explain what this deadweight loss represents.
```

**模板 D：外部性分析（Unit 6 核心模板）**

```
[给出 MSC/MPC/MSB/MPB/D/MR 图或文字描述]
(a) Is the externality positive or negative? Explain. / Draw a correctly labeled graph with MSB, MPB, MSC, MPC.
(b) Identify the socially optimal quantity. Explain.
(c) [如果垄断/完全竞争] Identify the unregulated firm's output. Explain.
(d) To produce the socially optimal output:
    (i) Should the government tax or subsidize?
    (ii) Calculate the dollar value of the per-unit tax/subsidy.
(e) [政策评估] Would the deadweight loss increase, decrease, or stay the same? Explain.
```

**模板 E：垄买市场（Monopsony）分析**

```
[给出 MFC, Supply, MRP 图表（含数值刻度）]
(a) If the wage rate is $X, state whether there will be a shortage or surplus. Calculate its size. Show your work.
(b) Identify the profit-maximizing number of workers. Explain using the graph.
(c) Identify the profit-maximizing wage rate. Explain using the graph.
(d) If the marginal product of [workers] increases, what will happen to output? Explain.
(e) [成本最小化] Assume the firm uses labor and capital. MP_L = A, MP_K = B, P_L = C, P_K = D. Should the firm rent more/less capital? Explain using marginal analysis.
```

### 三、答题动词体系（CB 的精确语义区分）

| 动词 | CB 期望的操作 | 评分要求 |
|-----|-----------|--------|
| **Identify** | 点名即可，1 句话 | 只需给出正确答案，无需解释 |
| **Explain** | 给出因果推理链 | 必须包含"because"逻辑，不能只说结论 |
| **Calculate** | 数学运算 + 展示过程 | 必须 show your work，只写答案不得分 |
| **Show your work** | 写出计算步骤 | 必须有公式或算式，不能只有最终数字 |
| **Draw** | 画正确标注的图 | axes 有标签 + curves 有标签 + 方向变化标注 |
| **Using the labeling on the graph** | 用图上已有标注回答 | 必须使用原图的 P1, Q2 等标签 |
| **Compare** | 两者对比 | 必须说明两者的差异方向 |
| **Using marginal analysis** | 用边际分析法解释 | 必须提到 MR vs MC 或 MRP vs wage 的比较 |

### 四、FRQ 的递进逻辑结构

CB 的 FRQ 设计有一个**明确的认知递进**：

```
Part (a): 基础操作（计算/画图/识别）—— 记忆+应用层
    ↓
Part (b): 应用判断（利润最大化/均衡判断）—— 应用层
    ↓
Part (c): 定量分析（计算利润/计算 MRP）—— 应用+分析层
    ↓
Part (d): 推理延伸（长期变化/市场调整）—— 分析层
    ↓
Part (e)+(f): 高阶综合（弹性应用/政策评估/跨市场联动）—— 分析+评价层
```

**重要规律**：后面的 Part 常依赖前面 Part 的答案（如 "Based on your answer to part (c)"），但 CB 评分时各 Part **独立计分**，一个错不影响其他。

### 五、画图要求的标准规范

CB 在每份 FRQ 试卷开头都有**强制提示**（原文粗体）：

> "Include correctly labeled diagrams, if useful or required, in explaining your answers. A correctly labeled diagram must have all axes and curves clearly labeled and must show directional changes. If the question prompts you to 'Calculate,' you must show how you arrived at your final answer."

画图得分的关键清单：
1. X 轴和 Y 轴必须有标签（Quantity / Price / Wage / Number of Workers）
2. 每条曲线必须有标签（MC, ATC, D, MR, MRP, MFC, S）
3. 均衡点用虚线引到两轴，标注 P*, Q*
4. 变化方向用箭头或新曲线标注
5. 利润/亏损/死重损失区域要**完全阴影填充**

---

## 第三部分：跨 Unit 出题规律总结

### 各 Unit 的出题侧重点

| Unit | MCQ 核心考点 | FRQ 核心考点 |
|------|-----------|-----------|
| **Unit 1** (Basic Concepts) | 机会成本、PPC、比较优势 | PPC 画图 + 比较优势计算 |
| **Unit 2** (S&D) | 移动 vs 移位、弹性、CS/PS | S&D 图分析 + 政策效果 |
| **Unit 3** (Production & Cost) | MC/ATC/AVC 关系、shutdown rule、long-run equilibrium | **成本计算 + 利润最大化判断 + 长期调整** |
| **Unit 4** (Market Structures) | 垄断利润最大化、DWL、价格歧视、垄断竞争 long-run | **画图（垄断 vs 完全竞争）+ DWL 标注 + 市场结构比较** |
| **Unit 5** (Factor Markets) | 派生需求、MRP 计算、labor S&D shifts | **生产函数表 → MRP 计算 → 雇佣决策 + 成本最小化** |
| **Unit 6** (Externalities) | MSC/MSB/MPC/MPB 关系、public goods、Lorenz/Gini | **外部性图 → socially optimal Q → 税/补贴 → DWL** |

### 高频"跨 Unit 联动"题型

1. **完全竞争产品市场 + 劳动市场联动**：产品价格变化 -> MRP 移动 -> 劳动需求/工资变化
2. **垄断 + 外部性叠加**：垄断本身的 DWL + 负外部性的 DWL，是否可能互相抵消
3. **短期利润/亏损 -> 长期进入退出 -> 新均衡**：最经典的三段论链条
4. **弹性 + 总收入关系**：在需求弹性区间/非弹性区间的 TR 变化

---

## 第四部分：可复用的出题模板库

### MCQ 出题模板

**模板 M1：概念定义题**
```
Which of the following [is / best describes / is an example of] [经济学概念]?
(A) [正确定义/例子]
(B) [相近概念混淆]
(C) [因果颠倒]
(D) [范围错误——短期说成长期，或反之]
(E) [日常直觉但经济学上错误的表述]
```

**模板 M2：图表面积识别题**
```
[提供标准经济学图，标注关键点为字母]
"The [consumer surplus / producer surplus / economic profit / deadweight loss / total revenue] is represented by area..."
(A)-(E) 各提供一种面积字母组合
干扰项设计：用相邻面积替代、CS 和 PS 互换、混淆 profit 和 revenue 面积
```

**模板 M3：双变量方向判断题**
```
[变化事件描述]. The [变量1] and [变量2] will change in which of the following ways?
(A)-(E) 以 2x2 表格呈现 Increase/Decrease/No change 组合
```

**模板 M4：数据表格计算题**
```
[提供 Workers-Output 或 Quantity-TC 表格]
"[某边际量] of the [N]th [单位] is..."
(A) 正确的边际值
(B) 对应的总量（常见陷阱）
(C) 平均值
(D) 少算一个单位
(E) 多算一个单位或乘以了不该乘的因子
```

**模板 M5：因果推理链题**
```
Assume [初始条件 + 变化]. Which of the following [will occur / best explains / is most likely]?
(A) 正确的因果链完整推理
(B) 因果方向反转
(C) 跳过中间环节直接到结论（看似对但逻辑断裂）
(D) 混淆了 shift vs movement along
(E) 在正确方向上加了一个错误的附加判断
```

### FRQ 出题模板

**模板 F1：完全竞争企业成本分析（通用）**
```
[给出 Quantity - Total Cost 表（或 Total Variable Cost + Fixed Cost）]
[说明市场价格 = $P]
(a) Calculate [AFC / ATC / MC] of producing [N] units. Show your work.
(b) Identify the profit-maximizing quantity. Explain using marginal analysis.
(c) Calculate the economic profit at the profit-maximizing quantity. Show your work.
(d) Based on (c), will the number of firms increase/decrease/stay the same in the long run? Explain.
(e) Based on (c), will the market price increase/decrease/stay the same in the long run? Explain.
[可选高阶延伸]
(f) 弹性应用题 / 交叉弹性题
(g) 政策冲击题（price ceiling / shipping cost change）
```

**模板 F2：要素市场四部曲（通用）**
```
[给出 Number of [Workers] - Total Product per Hour 表]
(a) After which [worker] do diminishing marginal returns begin? Explain using numbers.
(b) Calculate the MRP of the [N]th [worker] at price $P. Show your work.
(c) At wage rate $W, how many [workers] to hire to maximize profit? Explain using marginal analysis.
(d) [外部变化] What will happen to:
    (i) [wage / MFC]. Explain.
    (ii) [demand curve / MRP curve]. Explain.
```

**模板 F3：垄买市场图表分析（通用）**
```
[给出 Wage Rate 纵轴, Quantity of Workers 横轴]
[三条曲线: MFC, Supply, MRP，标注数值刻度]
(a) If wage = $X, shortage or surplus? Calculate size. Show your work.
(b) Identify profit-maximizing number of workers. Explain using graph.
(c) Identify profit-maximizing wage rate. Explain using graph.
(d) If MP increases, what happens to output? Explain.
(e) [成本最小化] Given MP_L, MP_K, P_L, P_K, should firm rent more/less capital? Explain.
```

**模板 F4：外部性政策分析（通用）**
```
[给出 MSC/MPC/MSB/MPB 图表或文字描述]
(a) [画图 / 判断] 正负外部性？市场均衡 Q_M 和社会最优 Q_S。
(b) Identify the socially optimal quantity. Explain.
(c) [在垄断/竞争情境下] Identify unregulated output. Explain.
(d) Tax or subsidy? Calculate the dollar value.
(e) DWL 如何变化？Explain.
```

**模板 F5：市场结构比较（通用）**
```
"Consider two profit-maximizing firms: one is perfectly competitive, the other is a monopoly."
(a) Draw correctly labeled graphs for each firm showing:
    (i) Price
    (ii) Quantity of output
    (iii) Area of economic profits
(b) Explain the relationship between P and MR for each firm.
(c) How will economic profits change in the long run for each? Explain.
(d) Label the DWL on the monopoly graph. Explain what it represents.
```

---

## 第五部分：关键发现与启示

### 发现 1：CB 的"模板复用"策略

CB 在 Unit 5 的 FRQ 中使用了**几乎完全相同的四部曲模板**超过 10 次，只改变了：
- 企业名称（Michelle's / Bob's / Camila's / Briana's 等）
- 工人类型（bookkeepers / barbers / clerks / brick masons 等）
- 具体数字（产出表、价格、工资率）
- Part (d) 的外部变化类型（需求变化 / 替代投入价格变化 / 技术变化）

这意味着：**掌握一个模板就能应对该类型的所有变体。**

### 发现 2：图表是"门槛考点"

MCQ 和 FRQ 中约 40-50% 的题目涉及图表。不能读图的学生会丢掉近一半的分数。CB 最常用的 6 张图是：

1. 完全竞争企业短期图（MC, ATC, AVC, 水平价格线）
2. 垄断企业图（MC, ATC, D, MR）
3. 垄买劳动市场图（MFC, Supply, MRP）
4. 外部性图（MSC, MPC, D=MSB, MR）
5. LRATC 包络线图
6. S&D 供需图（含 CS/PS/DWL 面积）

### 发现 3：CB 的"答题动词"是精确的评分指令

- 看到 "Calculate" + "Show your work" = 必须有算式
- 看到 "Explain" = 必须有因果句式（Because... / Since... / This means...）
- 看到 "Identify" = 只需点名，写多了反而可能出错
- 看到 "Draw" = 必须画图，且每条曲线和每个轴都要有标签
- 看到 "Using marginal analysis" = 必须提到 MR vs MC 或 MRP vs MFC 的比较

### 发现 4：Progress Check vs Question Bank 的差异

| 维度 | Progress Check | Question Bank |
|------|---------------|--------------|
| 题量 | 每 Unit 15-21 道 MCQ + 1-2 道 FRQ | 每 Unit 30-60 道 MCQ + 5-19 道 FRQ |
| 难度 | 中等偏基础 | 覆盖全难度光谱 |
| 图表比例 | ~30% | ~40% |
| FRQ 复杂度 | 偏短，3-4 个 part | 偏长，可达 7 个 part 含嵌套 |
| 定位 | 单元形成性评估 | 考前综合训练 |

### 发现 5：选项的"完美对称"设计

CB 在双变量题中几乎总是提供**所有可能的组合**（Increase/Increase, Increase/Decrease, Decrease/Increase, Decrease/Decrease, No change variant），确保学生不能通过排除法猜对。这是一种非常严谨的出题工程。

---

以上就是基于 CB 官方题库的系统性分析。这份手册的核心价值在于：**CB 的出题模式高度模板化和可预测**，掌握了这些模板和规律，就能从"出题者视角"理解考试设计逻辑。