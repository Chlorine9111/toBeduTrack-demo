# AP 宏观经济学 CB 出题者模式手册

## 一、考试总体架构

### 1.1 六大核心单元与考试权重

| 单元 | 内容 | 估计权重 |
|------|------|---------|
| Unit 1 | 基本经济概念（PPC、供需） | 5-10% |
| Unit 2 | GDP、CPI、失业率测量 | 12-15% |
| Unit 3 | AD-AS 模型（国民收入与价格决定） | 20-25% |
| Unit 4 | 金融部门（货币市场、银行体系、货币政策） | 15-20% |
| Unit 5 | 政策的长期后果（乘数、Phillips 曲线、挤出效应） | 20-25% |
| Unit 6 | 开放经济（汇率、国际收支、资本流动） | 10-15% |

### 1.2 MCQ 与 FRQ 格式

- **MCQ**: 60 题，70 分钟，5 个选项 (A)-(E)
- **FRQ**: 3 题，60 分钟
  - 1 道长题（10 分，多 part，必含画图）
  - 2 道短题（各 5 分，可能含画图或计算）

---

## 二、MCQ 出题模式深度分析

### 2.1 题干结构分类

基于对 280+ 道 MCQ 的分析，CB 出题者使用以下六种题干结构：

#### 类型 A：直接概念判断（约 30%）

最基础的题型，直接考某个概念的定义或属性。

**模板**: "Which of the following is true about [概念]?"

**实例**:
- "The federal funds rate is the interest rate that..." (Q31, Unit 4)
- "Which of the following is true about the Phillips curve?" (Q1, Unit 5)
- "The short-run Phillips curve shows an inverse relationship between..." (Q65, Unit 5)

**出题者意图**: 筛选"背了但没理解"的学生。干扰项往往是**部分正确**或**概念混淆**。

#### 类型 B：因果链推理（约 25%）

给出一个初始变化，追踪其对 2-3 个变量的连锁效应。

**模板**: "If [初始事件], [变量X] and [变量Y] will change in which of the following ways?"

**选项格式**: 二维表格（2-4 列），每个选项是一组 Increase/Decrease/No change 的组合。

**实例**:
- "A contraction in the money supply will most likely change the nominal interest rate and aggregate demand in which of the following ways?" (Q29, Unit 4)
- "If a contractionary fiscal policy is followed by an expansionary monetary policy, nominal interest rate and employment would most likely be affected in which of the following ways?" (Q10, F+M Policy)

**出题者关键手法**:
1. **"indeterminate" 陷阱**: 当两个政策方向相反时，某个变量的净效果不确定，答案中会出现 "indeterminate"
2. **长链条推理**: 政策 -> 利率 -> 投资 -> AD -> GDP/PL，每一步都是一个潜在出错点
3. **表格选项**: 强迫学生同时判断多个变量，不能只记住一半

#### 类型 C：图表分析（约 20%）

给出一张图，要求读图并推断经济状态或政策效果。

**宏观经济学常见图表**:

| 图表类型 | 出现频率 | 考查内容 |
|---------|---------|---------|
| AD-AS 模型（含 LRAS） | 极高 | 缺口识别、政策效果、自动调节 |
| 货币市场（MS/MD） | 高 | 利率变动、Fed 操作 |
| 外汇市场（S/D for currency） | 高 | 汇率升贬值、贸易影响 |
| Phillips 曲线（SRPC + LRPC） | 中 | 通胀-失业权衡、曲线移动 |
| 可贷资金市场 | 中 | 利率与投资 |
| 准备金市场（新考纲） | 低 | administered rates |

**图表题出题规律**:

1. **AD-AS 图的标准考法**:
   - 给出 LRAS、SRAS、AD 三条曲线，均衡点偏离充分就业
   - 问: "在没有政策干预的情况下，长期会发生什么？"
   - 正确答案永远是: SRAS 通过工资调整移动，经济回到 LRAS

2. **多均衡点图**: 如 Q13（AD-AS 图上标注 Q/N/M/R 四个点），问短期和长期移动路径。这类题要求学生能在图上追踪两步以上的变化。

3. **图表中的"隐藏信息"**: 如 Q8（SRAS 曲线 + Full-employment Output 线），失业率低于自然率时产出在 Y2 右侧——学生必须能将文字数据与图形位置对应。

#### 类型 D：情景设定（约 10%）

给出一个国家的经济状况，要求推荐政策或预测结果。

**模板**: "Assume that a country's economy is [经济状态]. [政策问题]?"

**实例**:
- "Assume that the economy is at full-employment equilibrium. If consumers and firms become more optimistic about future income and profits, which of the following will occur in the short run?" (Q21, AD-AS)
- "If a country's economy is operating below the full-employment level of output at a very low inflation rate, the central bank of the country is most likely to..." (Q20, Monetary)

#### 类型 E：数据计算（约 10%）

给出具体数值，要求计算。

**常见计算类型**:
1. **货币乘数**: 给 reserve ratio，算 money multiplier = 1/rr，再算货币供应变化
   - "If the reserve requirement is 10% and the central bank sells $10,000..." -> 变化 = $10,000 x (1/0.1) = $100,000
2. **汇率换算**: "1.2 euros per dollar, 30 euros meal = ?" -> 30/1.2 = $25
3. **国际收支计算**: 给出 exports, imports, net income, 算 current account balance
4. **GDP 支出法**: C + I + G + NX

**出题者陷阱**: 在乘数计算中，买/卖方向搞反；在汇率题中，正反向汇率混淆。

#### 类型 F：EXCEPT/NOT 题（约 5%）

**模板**: "All of the following [做某事] EXCEPT..."

**实例**: "All of the following explain why prices and wages are sticky EXCEPT" (Q20, AD-AS)

**应对策略**: 这类题的正确答案是唯一"不属于"的选项，四个错误选项都是正确描述。

### 2.2 选项设计的干扰手法

#### 手法 1：方向混淆（最常见）

在因果链的某一步翻转方向。

**典型案例**: 
- 问 expansionary monetary policy 的效果
- 正确链: Buy bonds -> MS up -> interest rate down -> Investment up -> AD up -> GDP up, PL up
- 干扰选项: interest rate **up** (在第二步翻转)

#### 手法 2：财政 vs 货币政策混淆

在选项中混入另一种政策的工具。

**实例**: "Which of the following is a **monetary** policy that can be used to counteract a recession?"
- (D) Lowering tax rates [这是财政政策]
- (E) Increasing government spending [这也是财政政策]
- 正确答案: (A) Buying bonds in the open market

#### 手法 3：短期 vs 长期混淆

利用学生不分时间维度的弱点。

**实例**: 
- 短期: AD 移动 -> GDP 和 PL 都变
- 长期: AD 移动 -> 只有 PL 变（因为经济回到 Yf）
- Q41: "A shift in the aggregate demand curve will change ____ in the long run" -> 只有 price level

#### 手法 4：Nominal vs Real 混淆

在利率和工资相关题目中频繁出现。

**实例**: Q37 adverse supply shock 的效果 -> "increase in the price level and a decrease in the **real** wage"（名义工资不变但价格上升，所以实际工资下降）

#### 手法 5："Indeterminate" 陷阱

当两个相反方向的力同时作用于同一变量时。

**实例**: 
- 同时实施扩张性财政政策和紧缩性货币政策 -> GDP 效果 indeterminate
- 同时实施扩张性财政+扩张性货币 -> 利率效果 indeterminate（fiscal pushes up, monetary pushes down）

### 2.3 宏观经济学 MCQ 的特有模式（与微观对比）

| 维度 | 宏观 | 微观 |
|------|------|------|
| 图表类型 | AD-AS、Money Market、Phillips Curve、Foreign Exchange | S&D for individual markets, cost curves |
| 选项格式 | 大量使用二维/三维表格 | 更多纯文字选项 |
| 推理链长度 | 通常 3-5 步 | 通常 1-2 步 |
| 政策类题 | 占 40%+ | 很少 |
| 计算难度 | 简单（乘数、汇率） | 中等（弹性、MC/ATC） |
| "两面夹击"题 | 非常多（同时考 fiscal + monetary） | 很少 |

---

## 三、各核心考点的出题模式

### 3.1 AD-AS 模型（Unit 3）—— 最核心考点

**出题频率**: 在所有 MCQ 中占比最高，FRQ 必考。

**八大反复考查的知识点**:

1. **SRAS vs LRAS 的区别**
   - SRAS 上倾斜（因工资粘性）
   - LRAS 垂直（在充分就业产出处）
   - 考法: "An aggregate supply curve may be horizontal over some range because..." (Q11)

2. **AD 的移动因素**: C, I, G, NX 变化
   - 高频考: 军事开支增加 -> AD 右移 (Q40)
   - 外国收入下降 -> 出口减少 -> AD 左移 (Q28)

3. **SRAS 的移动因素**: 投入品价格、预期价格水平、生产率
   - 高频考: 能源价格上升 -> SRAS 左移 (Q36)
   - 劳动生产率下降 -> SRAS 左移 (Q31)
   - **核心区分**: Price level 变化是沿线移动，不是线的移动 (Q16)

4. **短期均衡调整**
   - AD 减少 -> PL 下降, GDP 下降 (Q3 答案 E)
   - AD 增加 -> PL 上升, GDP 上升 (Q21)
   - SRAS 增加 -> PL 下降, GDP 上升 (Q32)

5. **长期自动调整机制** (考题中反复出现)
   - GDP > Yf -> 工资上涨 -> SRAS 左移 -> 回到 LRAS (Q1, Q7)
   - GDP < Yf -> 工资下降 -> SRAS 右移 -> 回到 LRAS (Q9, Q30)
   - **必考句型**: "As wages [rise/fall], the SRAS curve will shift to the [left/right]"

6. **Stagflation（滞胀）**
   - SRAS 左移 -> PL 上升 + GDP 下降
   - 必须能识别: "leftward shift of the short-run aggregate supply curve only" (Q10, Q12)

7. **Demand-pull vs Cost-push inflation**
   - Demand-pull: AD 右移 (Q13 追踪 R->M->N)
   - Cost-push: SRAS 左移，如生产率下降 (Q33)

8. **短期 vs 长期效果对比**
   - Q4: 长期 AD 减少 -> GDP no change, PL decrease
   - Q41 (Long run): AD shift only changes price level

### 3.2 货币政策与金融部门（Unit 4）

**出题频率**: MCQ 约 59 题，FRQ 几乎必考画 Money Market 图。

**核心出题链条**（CB 反复考查的"货币传导机制"）:

```
Fed 操作 -> 银行准备金 -> 货币供给 -> 利率 -> 投资 -> AD -> GDP/PL
```

**七大高频考点**:

1. **三大货币政策工具**（传统考法，新考纲已弱化 reserve ratio）
   - 公开市场操作（出现频率最高）: 买债券=扩张，卖债券=紧缩
   - 贴现率: 降=扩张，升=紧缩
   - 准备金率: 降=扩张，升=紧缩
   - **核心陷阱**: 混入财政政策工具（税率、政府支出）作为干扰项 (Q8)

2. **货币乘数计算**
   - Money multiplier = 1 / reserve ratio
   - 变化量 = initial change x multiplier
   - **必考变体**: "Fed sells $10,000 bonds, rr=20%" -> MS decrease by $50,000 (Q11, Q12)
   - **陷阱**: Fed sell 时银行不会贷出去，MS 只变一次（Q9: banks don't loan out -> MS remains unchanged）

3. **利率-债券价格反向关系**
   - 必须理解: Bond prices up <-> Interest rates down
   - Q4: AD increase -> interest rates up, bond prices down
   - Q16: Fed buys bonds -> bond prices up, interest rates down

4. **Money Market 图**
   - MS 垂直线，MD 下倾斜
   - 收入增加 -> MD 右移 -> 利率上升（FRQ 评分标准明确要求）
   - 物价上升 -> MD 右移（沿 MS 移动）

5. **Fed 对经济状况的反应**
   - 通胀高 -> 卖债券/提高利率 (Q19: 大量卖债券 -> responding to rising price levels)
   - 衰退 -> 买债券/降低利率 (Q20: below full employment + low inflation -> buy bonds)
   - **高级陷阱**: Q18 "最不愿意增加货币供给" -> 低失业+高通胀（5%, 10%），因为已经通胀了

6. **货币需求**
   - 收入增加 -> MD 增加（交易需求）
   - 利率上升 -> 持有货币减少（机会成本）
   - **高频考点**: 投机性需求 -> 预期利率上升 -> 持有货币等债券降价 (Q28: speculation)

7. **新考纲：Administered Rates（管理利率）与准备金市场**
   - Reserve market 图：supply curve 在 ample reserves 区间与 demand 相交
   - Central bank 直接设定 administered interest rates
   - FRQ 已经考过：画 reserve market 图并展示利率变化

### 3.3 财政政策与乘数（Unit 5 Part 1）

**出题特征**: 大量使用 fiscal+monetary 组合政策题。

**高频出题模式**:

1. **组合政策效果判断**（CB 最偏爱的高级题型）

| 组合 | GDP 效果 | 利率效果 |
|------|---------|---------|
| 扩张 fiscal + 扩张 monetary | GDP 确定上升 | 利率 indeterminate |
| 紧缩 fiscal + 紧缩 monetary | GDP 确定下降 | 利率 indeterminate |
| 扩张 fiscal + 紧缩 monetary | GDP indeterminate | 利率确定上升 |
| 紧缩 fiscal + 扩张 monetary | GDP indeterminate | 利率确定下降 |

**这是 CB 最高频的出题模板，在 F+M Policy PDF 中 36 道题里至少有 25 道以上考这个。**

2. **政策目标匹配**
   - 问题模式: "To achieve [目标], which combination of policies..."
   - 刺激投资 + 不增加产出 -> 扩张 monetary + 紧缩 fiscal (Q32)
   - 维持利率 + 扩张财政 -> Fed 必须 buy bonds 配合 (Q16)
   - 减少通胀 -> increase taxes + sell bonds (Q5, Q17)

3. **完全挤出效应**
   - G 增加被私人投资减少完全抵消 -> AD 不变 -> B 选项 (Q7, Q19)

### 3.4 挤出效应与预算赤字（Unit 5 Part 2）

**出题频率**: 约 35 道 MCQ 专门考这两个话题。

**核心出题模式**:

1. **Crowding Out 定义题**（反复考）
   - "Crowding out refers to the decrease in..." -> 私人投资 (Q13)
   - "Crowding out occurs when..." -> 政府借债 -> 利率上升 -> 私人投资下降 (Q12, Q14, Q28)
   - 出现了至少 8 道定义类重复题，说明 CB 认为这是核心概念

2. **Crowding Out 的影响因素**
   - 投资对利率越敏感 -> 挤出效应越大 (Q36, Q37)
   - 货币需求对收入越不敏感 -> 挤出效应越大

3. **Budget Deficit vs National Debt**
   - Deficit = flow（一年内支出>收入）
   - Debt = stock（历年 deficit 累积）
   - Q5: 正确区分两者 -> "The debt is the accumulated value of government deficits and surpluses"
   - Q17: National debt = "accumulation of past and current budget deficits and surpluses"

4. **自动稳定器**
   - 衰退 -> 税收自动减少 + 转移支付自动增加 -> 预算自动赤字 (Q51)
   - 平衡预算规则 -> 消除自动稳定器功能 (Q4)

### 3.5 Phillips 曲线（Unit 5 Part 3）

**出题频率**: 约 30 道 MCQ，FRQ 经常作为补充考点。

**四大核心出题模式**:

1. **SRPC vs LRPC 基本属性**
   - SRPC: 下倾斜，通胀与失业反向 (Q62, Q64, Q65, Q67 反复考)
   - LRPC: 垂直，位于自然失业率处 (Q46, Q47)
   - LRPC 含义: 长期无通胀-失业权衡 (Q48)

2. **沿线移动 vs 线移动**
   - AD 变化 -> 沿 SRPC 移动 (Q39: "a movement along a given short-run Phillips curve")
   - Supply shock / 预期通胀变化 -> SRPC 移动 (Q52, Q53, Q54)
   - **重要区分**: AD 变化不移动 LRPC (Q1)

3. **SRPC 移动方向**
   - 预期通胀上升 -> SRPC 右移（更差的权衡）(Q54)
   - 供给冲击（投入品涨价）-> SRPC 右移 (Q52)
   - 生产率提高 -> SRPC 左移（更好的权衡）

4. **图表读取**
   - Q41: Phillips 曲线图上从 S 到 R（沿 SRPC 向左上移动）-> 扩张性政策
   - Q56: 从 X 到 Y -> 扩张性需求政策
   - Q60: SRPC + LRPC 图，给 inflation rate 求 unemployment rate -> 直接读图

### 3.6 国际贸易与汇率（Unit 6）

**出题频率**: 约 57 道 MCQ，FRQ 偶尔涉及。

**五大出题模式**:

1. **外汇市场基本操作**
   - 美国人想买日本车 -> 需要卖美元买日元 -> 美元供给增加 -> 美元贬值 (Q1)
   - 外国人买美国资产 -> 需要美元 -> 美元需求增加 -> 美元升值 (Q47)

2. **利率差 -> 资本流动 -> 汇率 -> 贸易**（核心链条）
   ```
   US 利率上升 -> 资本流入 US -> 美元需求增加 -> 美元升值 -> 进口增加/出口减少 -> 贸易赤字扩大
   ```
   - Q35: 实际利率上升 -> capital flows in + dollar appreciates
   - Q51: Canada 利率上升 -> financial capital inflow
   - Q57: Country X 利率上升 -> capital inflow, currency appreciate, exports decrease

3. **货币政策 -> 汇率的连接**
   - Contractionary monetary -> 利率 up -> 美元 appreciate -> imports up, exports down (Q4, Q5, Q19)
   - Expansionary monetary -> 利率 down -> 美元 depreciate -> imports down, exports up (Q42)
   - Q5 完整链: Fed sells bonds -> MS decrease -> interest rate increase -> dollar value increase

4. **国际收支账户**
   - Current account = Exports - Imports + Net income from abroad + Net unilateral transfers
   - Current account deficit = Capital/Financial account surplus (Q25, Q26, Q54)
   - **计算题**: Q9-10 给表格算 current account; Q24 给交易数据算 balance

5. **通胀差异 -> 汇率**
   - 高通胀国 -> 货币贬值 (Q20, Q21, Q55)
   - Q45: 固定汇率下通胀上升 -> imports increase, exports decrease

6. **"Twin Deficits" 考法**
   - Budget deficit -> 利率 up -> 资本流入 -> 货币升值 -> 贸易赤字 (Q7, Q8, Q50)
   - Q29: Government spending increase without raising taxes -> real interest rates increase -> net exports decrease

---

## 四、FRQ 出题模式深度分析

### 4.1 FRQ 的标准结构模板

基于 FRQ.pdf 和 Answer.pdf（183 页评分标准），CB 的 FRQ 遵循极其固定的模板:

#### 长题模板（10 分，5-6 parts）

```
Part (a): 画图 [2-3 分]
  - "Using a correctly labeled graph of [模型名], show each of the following:"
  - (i) 当前均衡点（标注 PL1, Y1）
  - (ii) 充分就业产出（标注 Yf）
  
Part (b): 识别政策 [1 分]
  - "What [monetary/fiscal] policy action should [机构] use to..."
  
Part (c): 画另一张图 [2 分]
  - "Draw a correctly labeled graph of [另一个市场], and show how..."
  
Part (d): 推断变量变化 [2-3 分]
  - "Based on [前面的分析], will each of the following increase, decrease, or remain the same?"
  - (i) [变量 1]. Explain.
  - (ii) [变量 2]
  
Part (e): 长期分析 [2 分]
  - "Assume instead that [no policy intervention]. In the long run, will..."
```

#### 短题模板（5 分，3-4 parts）

```
Part (a): 识别/画图 [1-2 分]
Part (b): 推断效果 [1-2 分]  
Part (c): 解释机制 [1-2 分]
```

### 4.2 FRQ 评分的关键规则

从 Answer.pdf 的评分标准中提炼出的核心规则:

#### 画图评分（最严格的部分）

**"Correctly labeled graph" 的完整要求**:
1. 坐标轴必须标注（Price Level / Real GDP，或 Nominal Interest Rate / Quantity of Money）
2. 曲线必须标注名称（AD, SRAS, LRAS, MS, MD）
3. 均衡点必须标注（PL1, Y1 等）
4. 变化方向必须正确（移动方向、新旧曲线）
5. 新均衡必须标注

**评分标准原文示例**（FRQ Answer p.17-20）:
- "One point is earned for a correctly labeled graph of the money market"（1 分）
- "One point is earned for showing a rightward shift of the money demand curve"（1 分）
- "One point is earned for the explanation that higher income means more volume of transactions"（1 分）
- "One point is earned for concluding that the nominal interest rate increases"（1 分）

**关键发现**: 画图相关的 4 分中，**图本身只值 1-2 分**，更多分数在于**图上展示正确的变化**和**文字解释**。

#### 文字解释评分

**"Explain" 的标准**: 必须包含因果连接，不能只说结论。

正确示例: "Real output will increase **because** the decrease in the interest rate increases investment spending, which increases aggregate demand."

错误示例: "Real output will increase."（只有结论没有解释 = 0 分）

#### "Increase, Decrease, or Remain the Same" 评分

- 只需要写方向（1 分），但如果后面有 "Explain"，还需要因果链（额外 1 分）
- "Natural rate of unemployment" -> 永远是 "remain the same"（这是 CB 设的陷阱）

### 4.3 FRQ 常考的六大题目模板

#### 模板 1: AD-AS + 政策干预（出现频率最高）

```
情景: 经济处于 [衰退/通胀缺口]
(a) 画 AD-AS 图，标注当前均衡和 Yf
(b) 推荐财政或货币政策
(c) 画 Money Market / Reserve Market 图展示政策效果
(d) 分析对 real output, unemployment, price level 的影响
(e) 如果不干预，长期会怎样
```

**实例**（FRQ p.19-20）: 
- 经济短期均衡，失业率低于自然率
- (a) 画 AD-AS 图，Y1 > Yf
- (b) 央行应提高 administered interest rates
- (c) 画 reserve market 图
- (d) real output 变化 + natural rate of unemployment 变化
- (e) 不干预时 SRAS 和 AD 的长期变化

#### 模板 2: 货币传导机制（Money Market 联动）

```
情景: [某事件] 导致 [money demand/supply] 变化
(a) 画 money market 图展示变化
(b) 分析对 nominal interest rate 的影响
(c) 分析对 real interest rate 的影响
(d) 分析对 AD/SRAS 的影响
```

**实例**（FRQ Answer p.17-18）:
- 收入增加 -> money demand 右移
- (b) nominal interest rate increases（4 分）
- (c) real interest rate is indeterminate（2 分）—— 因为 nominal rate up 但 inflation 也可能 up
- (d) aggregate supply curve shifts right, AD unaffected（2 分）

#### 模板 3: 开放经济联动

```
情景: [某国] 实施 [某政策]
(a) 对利率的影响
(b) 对汇率的影响
(c) 对贸易余额的影响
(d) 画外汇市场图
```

#### 模板 4: Phillips 曲线联动

```
情景: 经济从长期均衡受到 [冲击]
(a) 画 AD-AS 图展示冲击
(b) 在 Phillips 曲线图上标注对应移动
(c) 长期调整路径
```

### 4.4 FRQ 的评分分值分布

从评分标准分析，典型的长题分值分配:

| Part | 内容 | 分值 | 常见失分原因 |
|------|------|------|------------|
| (a) 画图 | 正确标注的图 | 2-3 | 轴标注遗漏、曲线方向错误 |
| (b) 政策识别 | 指出正确政策 | 1 | 财政/货币混淆 |
| (c) 画另一张图 | 展示传导机制 | 2 | 移动方向错误 |
| (d) 变量分析 | Increase/Decrease + Explain | 2-3 | 只写结论不解释 |
| (e) 长期分析 | 无干预时的调整 | 2 | 不理解自动调整机制 |

---

## 五、出题者的"思维模型"总结

### 5.1 CB 出题者最看重的能力

1. **因果链推理**: 能完整追踪 "政策 -> 中间变量 -> 最终目标" 的全链条
2. **图形-文字转换**: 能将图表信息转化为经济分析，反之亦然
3. **短期/长期区分**: 同一事件在短期和长期的不同效果
4. **名义/实际区分**: nominal vs real interest rate, nominal vs real GDP/wages
5. **不确定性判断**: 知道什么时候答案是 "indeterminate"

### 5.2 出题者最常设的陷阱总结

| 排名 | 陷阱类型 | 举例 |
|------|---------|------|
| 1 | 因果链某步方向翻转 | Buy bonds -> interest rate up（应该是 down） |
| 2 | 财政/货币政策工具混淆 | 把 "increase taxes" 列为 monetary policy 选项 |
| 3 | 短期/长期效果混淆 | 长期 AD shift 只改变 PL，不改变 GDP |
| 4 | "No change" / "Indeterminate" 选项 | 同时两个力作用时净效果不确定 |
| 5 | 沿线移动 vs 整线移动 | Price level change 是沿 AD 移动，不移动 AD |
| 6 | 乘数计算买卖方向搞反 | Fed sells = money supply decrease（不是 increase） |
| 7 | 汇率方向判断 | 美元升值 = exports decrease（不是 increase） |
| 8 | Natural rate 不变陷阱 | 任何需求政策都不改变 natural rate of unemployment |

### 5.3 宏观经济学独有的出题特征（与微观的本质区别）

1. **图表密度更高**: 宏观每道 FRQ 至少要画 1-2 张图，MCQ 约 20% 含图
2. **政策选择题占比极高**: 约 40% 的 MCQ 涉及 "应该采取什么政策"
3. **"同时考两个市场"是常态**: 如 Money Market + Loanable Funds, AD-AS + Phillips Curve, Money Market + Foreign Exchange
4. **"因果链"比微观长 2-3 倍**: 微观: P up -> Qd down; 宏观: Fed buys bonds -> MS up -> i down -> I up -> AD right -> Y up, PL up -> MD up -> ... 
5. **表格选项出现频率是微观的 3-5 倍**: 因为宏观总是需要同时判断多个变量的方向

---

## 六、出题难度分级与策略建议

### 6.1 题目难度三级分类

| 难度 | 特征 | 占比 | 例子 |
|------|------|------|------|
| 基础 | 单步因果、定义识别 | 30% | "Federal funds rate is..." |
| 中等 | 2-3 步因果链、单图分析 | 45% | "Fed buys bonds -> interest rate and AD change..." |
| 高级 | 多市场联动、组合政策、indeterminate | 25% | "Expansionary fiscal + contractionary monetary -> interest rate and GDP..." |

### 6.2 AI 出题时的关键模仿要素

如果要用 AI 生成 CB 风格的 AP 宏观经济学题目，必须:

1. **MCQ 选项设计**: 每道题至少 2 个干扰项是"因果链某步翻转"，1 个是"概念混淆"（fiscal/monetary, nominal/real, short-run/long-run）
2. **表格选项**: 至少 30% 的 MCQ 使用二维或三维表格作为选项
3. **图表题**: 图上必须有明确标注的曲线名、轴名、均衡点
4. **FRQ 画图**: 必须明确要求 "correctly labeled graph"，评分时图的标注和移动方向各占分
5. **"Explain" 要求**: FRQ 中凡是带 "Explain" 的子题，必须给因果连接才能得分
6. **Indeterminate 选项**: 组合政策题中必须包含至少一个"不确定"的选项

---

*本手册基于对 CB 官方 AP Macroeconomics 题库中 280+ 道 MCQ（涵盖 Unit 3-6）和完整 FRQ 评分标准（183 页）的系统分析编写。*
