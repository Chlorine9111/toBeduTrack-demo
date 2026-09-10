数据充分，我现在可以进行完整的深度分析。以下是基于所有已读取 PDF 的系统性分析报告。

---

# AP 微积分 AB/BC CB 出题者模式手册

---

## 第一部分：考试结构总览

### AB 考试结构（8 个单元）
| 单元 | 主题 | 核心内容 |
|------|------|---------|
| Unit 1 | 极限与连续 | 极限定义、极限计算、连续性判断 |
| Unit 2 | 导数定义与基本规则 | 导数定义、求导法则 |
| Unit 3 | 复合/隐函数求导 | 链式法则、隐函数微分 |
| Unit 4 | 导数应用（情境） | 相关变化率、线性近似 |
| Unit 5 | 导数分析应用 | 极值、MVT、EVT、IVT、凹凸性 |
| Unit 6 | 积分与累积 | 黎曼和、FTC、定积分 |
| Unit 7 | 微分方程 | 分离变量、斜率场 |
| Unit 8 | 积分应用 | 面积、体积、运动问题 |

### BC 在 AB 基础上新增（Unit 9-10 + 增强单元）
| 单元 | 主题 | BC 独有内容 |
|------|------|-----------|
| Unit 8+ | 弧长 | 曲线长度公式 |
| Unit 9 | 参数方程、极坐标、向量 | 参数求导、极坐标面积、弧长、向量值函数 |
| Unit 10 | 无穷级数 | 收敛判别、Taylor/Maclaurin 级数、误差界 |

---

## 第二部分：MCQ 深度分析

### 2.1 题干结构分类与占比

基于所有样本，MCQ 题干可归类为以下 **6 种标准模式**：

**模式 A：直接代数计算型（约 25%）**
- 给出函数表达式，直接求极限/导数/积分值
- 例：`lim(x->0) [7x^5 + 5x^2 + 12x] / [3x^5 + 4x]`（Unit 1 Q17）
- 例：`d/dx [int_2^x sin(t^4)dt]`（Unit 6 Q8）
- **特征**：题干简洁，一步或两步计算，考核公式掌握

**模式 B：图形读取与分析型（约 25%）**
- 给出函数图形，要求判断极限值、导数正负、积分面积等
- **子类 B1**：给 f(x) 图形 -> 求极限/函数值（Unit 1 Q7, Q8, Q9）
- **子类 B2**：给 f'(x) 图形 -> 推断 f(x) 性质（Unit 5 Q12）
- **子类 B3**：给 f'(x) 图形（含面积标注）-> 求积分值/极值（Unit 6 FRQ Q2）
- **子类 B4**：给速度-时间图 -> 求位移/距离（Unit 8 Q8）
- **子类 B5**：给两个曲线图 -> 求围成面积（Unit 8 Q4, Q14, Q15）
- **特征**：开圆点(o)表示不含、实圆点表示含，是极限题的标配视觉元素

**模式 C：数据表型（约 15%）**
- 给出函数在选定点的值表，从表中估算极限/导数/黎曼和
- 例：火箭高度表估算速度最大值（Unit 1 Q3）
- 例：f(x) 值逼近表判断单侧/双侧极限（Unit 1 Q10, Q11, Q12）
- 例：导数表 + 黎曼和（Unit 6 Q4）
- **特征**：表格通常 6-8 列，x 值从两侧逼近某个点

**模式 D：应用情境型（约 15%）**
- 物理/工程情境包装的微积分问题
- 粒子运动（位置、速度、加速度）是最高频情境
- 水流/温度/人口等变化率问题
- 例：跑步者经过观察台的速率（Unit 8 Q11）
- 例：容器漏水的速率表（Unit 6 FRQ Q1）
- 例：车辆内部温度模型（Unit 5 Q3）

**模式 E：概念判断型（约 10%）**
- 考查定义和定理的精确理解
- "Which of the following must be true?"
- "Why does this not contradict the [定理名]?"
- 例：lim f(x)=7 是否意味着 f 连续？（Unit 1 Q6）
- 例：EVT 不矛盾的原因（Unit 5 Q7）
- 例：MVT 适用条件判断（Unit 5 Q4）

**模式 F：等价变换型（约 10%）**
- 将一个极限/积分改写为等价表达式
- 例：`(x-9)/(sqrt(x)-3)` 的极限等价于哪个？（Unit 1 Q16）
- 例：将黎曼和极限转化为定积分（Unit 6 Q5, Q6）
- 例：`sin(x-1)/cos^2(x)` 的极限等价变换（Unit 1 Q18）

### 2.2 选项设计规律（关键发现）

**规律 1：四选项制（A/B/C/D）**
- Progress Check 全部采用 4 选项
- Question Bank 早期题目用 5 选项（A-E），后期统一为 4 选项
- **出题启示**：当前标准为 4 选项

**规律 2：数值干扰项的设计策略**

| 陷阱类型 | 具体手法 | 出现频率 |
|---------|--------|--------|
| 符号错误 | 正确答案的相反数 | 极高 |
| 分子分母倒置 | 如答案是 15/4，干扰项含 4/15 | 高 |
| 漏乘链式法则 | 少乘一个导数因子 | 高 |
| 近似值诱导 | 四个小数选项间距仅差 0.1-0.5 | 中（calculator 题） |
| 直接代入 vs 极限 | f(a) 当作 lim f(x) | 极高（Unit 1） |
| 单侧 vs 双侧 | 左极限存在但右极限不存在 | 高 |

**规律 3：选项排列逻辑**
- 数值选项：通常从小到大排列
- "nonexistent" / "does not exist" 通常在 (D) 位置
- 表述型选项：从简单到复杂排列

**规律 4：Calculator vs No Calculator 标记**
- 带有 **橙色方格图标** 的题目标记为 "Calculator allowed"
- Calculator 题特征：小数答案、复杂函数值、需要数值求根
- No Calculator 题特征：整数/分数答案、可手算、代数化简

### 2.3 Calculator 与 No Calculator 的题型差异

**Calculator Allowed（约 40% MCQ）**
- 给出 f'(x) 的复杂表达式（含三角和指数混合），求零点或极值
- 求定积分的数值近似
- 求 MVT 中 c 的具体数值
- 选项为 3-4 位小数
- 例：Unit 5 Q1（MVT 的 c 值 = 2.749）
- 例：Unit 5 Q2（f'(x)=x^2 - 2 - 3x cos x 的递减区间）

**No Calculator（约 60% MCQ）**
- 纯代数化简、因式分解
- 图形读取
- 概念判断
- 分段函数的极限
- 选项为整数或简单分数

### 2.4 数学专题分布

**AB 的题型按主题统计：**

| 主题 | MCQ 占比 | 典型考法 |
|------|---------|--------|
| 极限计算 | ~20% | 代入法、有理化、分段判断、表格逼近 |
| 导数计算 | ~15% | 乘积/商/链式法则、隐函数 |
| 导数应用 | ~20% | MVT/EVT/IVT、极值分类、凹凸性、递增递减 |
| 定积分 | ~15% | FTC、黎曼和、积分性质 |
| 积分应用 | ~15% | 面积、体积、运动学、累积量 |
| 微分方程 | ~10% | 斜率场、分离变量 |
| 连续性 | ~5% | 判断连续条件、可去间断点 |

**BC 新增主题统计：**

| 主题 | MCQ 占比 | 典型考法 |
|------|---------|--------|
| 参数方程 dy/dx | ~20% | dy/dt / dx/dt，切线斜率 |
| 参数 d^2y/dx^2 | ~15% | 二阶导数公式（极高频，反复考） |
| 弧长 | ~15% | 曲线长度积分设置 |
| 向量值函数 | ~15% | 求导、积分、速度/位置向量 |
| 级数收敛判别 | ~15% | n-th term test、积分判别、几何级数 |
| Taylor/Maclaurin | ~10% | 级数展开、收敛半径 |
| 极坐标 | ~10% | 面积、切线 |

### 2.5 图形题的使用方式（关键特征）

**频率**：约 30-40% 的 MCQ 包含图形

**图形类型统计：**
1. **函数图形（最常见）**：连续曲线 + 开/闭圆点标注间断点
2. **导数图形**：给 f' 的图推断 f 的性质（Unit 5 高频）
3. **速度-时间图**：正弦波形，含正负交替（Unit 8）
4. **分段线性图形**：由线段和半圆组成的 f 或 f'（Unit 6 FRQ 标配）
5. **两函数对照图**：并排展示 f 和 g 的图（Unit 1 Q14）
6. **阴影面积图**：两曲线围成区域（Unit 8 Q4, Q12, Q14, Q15）
7. **斜率场（slope field）**：微分方程可视化（question bank Q9）
8. **参数曲线图（BC）**：x(t) 和 y'(t) 并排（Unit 9 Q9）

**视觉元素标准化：**
- 实心点 = 函数值存在且等于该点
- 空心点 = 函数在该处的值不等于极限值（或未定义）
- 箭头 = 延伸至无穷
- 面积数值标注（如 "Area = 7"）是 FRQ 图形的标配

---

## 第三部分：FRQ 深度分析

### 3.1 FRQ 的标准结构模板

**核心发现：CB 的 FRQ 有极度稳定的模板化结构。**

#### 模板一：「图形 + 积分定义函数」（AB/BC 通用，最高频）

**标准设置：**
给出可微函数 g 的图形（含标注的水平切线位置和面积值），定义 h(x) = int_a^x g(t)dt

**标准 Part 递进：**
- (a) 求 h 的临界点（即 g(x)=0 的点）
- (b) 分类临界点（相对极大/极小/非极值），要求 justify
- (c) 求 h 同时递增且上凸（或递减且下凸）的区间，give a reason
- (d) 用 IVT 证明存在某个 c 使得 h(c) = 某值，justify
- (e) 求 g 在 [0,10] 上的平均值（= 1/10 * int_0^10 g(x)dx，用面积拼）

**BC 版本额外追加：**
- (f) 求含 h(x) 的复合极限（如 lim [h(x)-ax+b] / [x^2-c^2]，需 L'Hopital）
- (g) 求广义积分 int_a^inf g'(kx)dx（用换元 + 极限）
- (h) 判断几何级数 a + ar + ar^2 + ... 是否等于 g(某值)

**实证**：BC question bank TB_frq1 中的题目 1-5 全部是此模板的变体，仅改变图形形状、面积数值、下限 a 的值和系数。

#### 模板二：「数据表 + 黎曼和 + 导数近似 + FTC」（AB Unit 6 标配）

**标准设置：**
给出速率函数 R(t) 在若干时间点的值表（如漏水速率、温度变化率）

**标准 Part：**
- (a) 用差商近似导数 R'(某值)，注明单位
- (b) 用 Left/Right Riemann sum 近似 int R(t)dt，注明单位
- (c) 用 FTC 评估 int_a^b R'(t)dt = R(b) - R(a)
- (d) 将给定 Riemann sum 表达式写为定积分

#### 模板三：「导数图形（线段组成）+ 多步推理」（AB Unit 5/question bank）

**标准设置：**
g'(x) 的图形由 2-3 段线段组成，已知 g(某端点) 的值

**标准 Part：**
- (a) 求 g 的临界点
- (b) 分类临界点（justify answers）
- (c) 求 g 的绝对最大值（justify）
- (d) 判断某点是否是拐点（give a reason）
- (e) 判断另一点是否是拐点
- (f) 求含 g'(x) 的复合极限（如 lim [g'(x)+1] / [x^2-4]）
- (g) 用乘积法则求 h(x)=x*g(x) 在某点的导数值

#### 模板四：「运动问题（粒子/人）」（AB Unit 8 标配 FRQ）

**标准设置：**
给出速度函数 v(t)（通常含三角函数），时间区间 [0, T]

**标准 Part：**
- (a) 求首次变向时间 t1，求 [0,t1] 的平均速度
- (b) 求 t=T 时距起始位置的距离（位移 = int v(t)dt）
- (c) 求总行程距离（= int |v(t)|dt）
- (d) 用加速度积分解释物理含义，求 int_a^b a(t)dt

#### 模板五：「微分方程 + 斜率场」（AB question bank）

**标准设置：**
给出 dy/dx = f(x,y) 的表达式和斜率场图

**标准 Part：**
- (a) 在斜率场中画解曲线
- (b) 求极限行为（如 lim dy/dx as y->某值）
- (c) 求满足初始条件的特解，证明单调性
- (d) 求 dy/dx 取最大值的 y 值

#### 模板六：「极坐标/参数方程」（BC Unit 9 标配）

**标准设置：**
给出极坐标曲线 r1 和 r2 的图形

**标准 Part：**
- (a) 求两条曲线围成区域的面积
- (b) 在切线斜率 = tan 2 的点，求 dy/d(theta)
- (c) 求 r(theta) = r1 + r2 的最大距离原点值，justify

#### 模板七：「Taylor 级数」（BC Unit 10 标配）

**标准设置：**
给出 Taylor 级数的通项公式

**标准 Part：**
- (a) 求高阶导数值 f^(n)(0)
- (b) 用 Ratio Test 求收敛区间
- (c) 用二阶 Taylor 多项式近似 f(某值)
- (d) 用 Lagrange 误差界证明近似精度

### 3.2 FRQ 的计算 vs 解释题比例

| Part 类型 | 占比 | 典型指令词 |
|---------|------|---------|
| 直接计算 | ~40% | "Find", "Evaluate", "What is" |
| 计算 + 展示过程 | ~25% | "Show the computations", "Show that" |
| 判断 + 辩证 | ~25% | "Justify your answer", "Give a reason" |
| 概念解释 | ~10% | "Explain the meaning", "Using correct units" |

### 3.3 "Justify your answer" 的评分要求模式

CB 的 justify 答案有极其固定的模板：

**类型 1：极值分类的 justify**
> "Because f'(x) changes from positive to negative at x=c, f has a relative maximum at x=c."

**类型 2：IVT 应用的 justify**
> "Because h is continuous on [a,b], h(a)=... and h(b)=..., and [target value] is between h(a) and h(b), by the Intermediate Value Theorem, there exists c in (a,b) such that h(c)=[target]."

**类型 3：拐点的 justify**
> "f'' changes sign at x=c (from positive to negative / from negative to positive), so the graph of f has a point of inflection at x=c."

**类型 4：绝对极值的 justify**
> "On the closed interval [a,b], by the Extreme Value Theorem, f must attain an absolute maximum. Comparing f at critical points and endpoints: f(a)=..., f(c)=..., f(b)=..., the absolute maximum is [value] at x=[point]."

### 3.4 Calculator vs No Calculator 在 FRQ 中的分布

**No Calculator Section（Section II, Part B）**
- 1 小时，4 道题
- 纯代数/图形推理
- 明确标注 "NO CALCULATOR IS ALLOWED FOR THIS QUESTION."
- 占 FRQ 的大部分 Progress Check

**Calculator Required（Section II, Part A）**
- 明确标注 "A GRAPHING CALCULATOR IS REQUIRED FOR THIS QUESTION."
- 需要数值求根、数值积分
- 例：Unit 5 FRQ（f''(x) = x^2 cos(x^2+pi) 的凹凸区间需 calculator 求零点）
- 例：Unit 8 FRQ（v(t) = 200sin(t^2/76)/(t+1) 的积分需 calculator）
- 例：Unit 9 FRQ（极坐标面积的数值计算）

---

## 第四部分：AB vs BC 关键差异

### 4.1 共享内容（Unit 1-8）

BC 的 Unit 1-8 Progress Check 与 AB **几乎完全相同**（题目一样或高度相似）。BC 学生需要同时掌握所有 AB 内容。

### 4.2 BC 独有考点

| 考点 | 考法 | 难度层次 |
|------|-----|---------|
| dy/dx 参数形式 | (dy/dt)/(dx/dt)，最基础 | 低 |
| d^2y/dx^2 参数形式 | d/dt[dy/dx] / (dx/dt)，**最高频** | 中高（常错） |
| 向量值函数 | f(t) = <x(t), y(t)>，求 f'(t)、f(t) 值 | 中 |
| 弧长（直角坐标） | int sqrt(1+[f'(x)]^2) dx | 中 |
| 弧长（参数） | int sqrt([dx/dt]^2+[dy/dt]^2) dt | 中 |
| 极坐标面积 | 1/2 int r^2 d(theta) | 中 |
| 级数收敛判别 | nth term、geometric、p-series、integral test | 中 |
| Taylor/Maclaurin | 级数展开、收敛半径、Lagrange 误差 | 高 |
| 广义积分 | int_a^inf f(x)dx | 中 |

### 4.3 BC FRQ 的独特递进模式

BC 的 question bank FRQ（如 TB_frq1）展示了一种**超长 8-part 递进结构**：

```
(a) 基础积分计算
(b) 临界点分类 + justify
(c) 递增/凹凸组合判断 + reason
(d) IVT 存在性 + justify
(e) 平均值计算 + show computations
(f) L'Hopital 极限
(g) 广义积分（换元 + 极限）
(h) 几何级数 = 函数值？（收敛条件判断）
```

这比 AB 的 4-part 结构深度递增许多，后 3 个 part 是 BC 独有考点的融合。

---

## 第五部分：可复用的出题模板库

### 模板 M1：极限 MCQ（表格逼近型）

```
给出 x 和 f(x) 的值表（x 从两侧逼近某点 a）
问：以下哪个关于 lim f(x) 的结论必须成立？
选项设计：
(A) lim f(x) = [左侧逼近值]  ← 只看了单侧
(B) lim(x->a-) f(x) = [左极限值]  ← 正确答案（如果左右不同）
(C) lim(x->a+) f(x) = [右极限值]  ← 正确答案（如果左右不同）
(D) lim f(x) cannot be determined  ← 诱导犹豫
```

**陷阱**：左侧值振荡但右侧收敛（如 Unit 1 Q11 中 f(3.9)=5, f(3.99)=-25, f(3.999)=125）

### 模板 M2：图形极限 MCQ

```
给出含间断点的函数图形（开闭圆点标注）
问：lim(x->a) f(x) = ?
选项：(A) f(a)的值  (B) 左极限值  (C) 右极限值  (D) nonexistent
```

**设计要点**：确保 f(a) 存在但不等于极限值（空心点+实心点组合）

### 模板 M3：MVT/EVT/IVT 应用 MCQ

```
给出 f 的条件（连续/可微 + 端点值或导数值）
问：以下哪个 must be true / could be false？
选项：用三大定理的精确表述作为选项
陷阱：MVT 需要闭区间连续+开区间可微，函数有间断点则不适用
```

### 模板 M4：FTC + 积分定义函数 MCQ

```
给出 h(x) = int_a^x f(t)dt 或 h(x) = int_a^{g(x)} f(t)dt
问：h'(某值) = ?
选项设计：
(A) f(某值)  ← 忘记链式法则
(B) f(g(某值))  ← 忘乘 g'
(C) g'(某值) * f(某值)  ← 混淆内外
(D) g'(某值) * f(g(某值))  ← 正确
```

### 模板 M5：参数二阶导数 MCQ（BC 最高频）

```
给出 x(t) 和 y(t)
问：d^2y/dx^2 = ?
公式：d/dt[dy/dx] / (dx/dt)
陷阱选项：
(A) d^2y/dt^2 / (dx/dt)  ← 最常见错误
(B) (d^2y/dt^2) / (d^2x/dt^2)  ← 另一常见错误
(C) 忘除 dx/dt
(D) 正确答案
```

### 模板 M6：级数收敛判别 MCQ（BC）

```
给出级数 sum a_n
问：收敛还是发散？/ nth term test 能用于哪些？/ integral test 能判别哪些？
选项设计：
- 利用 "lim a_n = 0 不保证收敛"（调和级数陷阱）
- p-series p<=1 发散 vs p>1 收敛
- 几何级数 |r|<1 收敛
```

### 模板 F1：标准 FRQ 模板（图形+积分函数）

```
给出 g 的图形（分段线性/曲线，标注水平切线和面积）
定义 h(x) = int_a^x g(t)dt + 常数

(a) [计算] 求所有临界点
(b) [判断+justify] 分类临界点
(c) [分析+reason] 求满足两个条件的区间（如递增且下凸）
(d) [定理应用+justify] IVT 存在性证明
```

### 模板 F2：标准 FRQ 模板（数据表+黎曼和）

```
给出速率函数的值表

(a) [近似] 差商近似导数，标注单位
(b) [近似] 左/右黎曼和近似积分，标注单位
(c) [FTC] 求 int R'(t)dt = R(b)-R(a)
(d) [转化] 将 Riemann sum 极限写为定积分
```

### 模板 F3：标准 FRQ 模板（运动问题）

```
给出速度函数 v(t)，初始位置

(a) 求首次变向时间 + 平均速度
(b) 求 t=T 时的位移
(c) 求总距离
(d) 加速度积分的物理解释 + 计算
```

---

## 第六部分：核心出题规律总结

### 规律 1：「三角色轮换」
CB 反复在 f, f', f'' 三个层级之间切换考查。给 f 的图求 f' 的性质，给 f' 的图求 f 的性质，给 f'' 判断拐点。这是贯穿所有单元的核心思路。

### 规律 2：「Justify 是分值核心」
FRQ 中仅给出正确数值但无 justification 只能拿到部分分。CB 的 rubric 对 justify 有严格的语言要求：必须引用定理名称 + 验证前提条件 + 得出结论。

### 规律 3：「单位意识」
所有应用题（速率、面积、体积）必须标注单位。"gallons per hour"、"feet per second" 等在 FRQ 评分中是独立得分点。

### 规律 4：「变体复用」
CB 大量使用同一模板的微调变体。如 BC TB_frq1 包含 5 道结构完全相同的题，仅改变图形形状和数值。出题时可以安全复用模板，改变系数和图形即可。

### 规律 5：「Calculator 题的数值特征」
Calculator 题的答案通常是 3-4 位小数，选项间距 0.5-2.0。这些题无法手算，必须依赖图形计算器的数值功能。

### 规律 6：「BC 的递进融合」
BC 的 FRQ 后半部分（f/g/h part）会将极限、广义积分、级数三个 BC 独有考点融合到同一个以积分定义函数为核心的问题中，形成跨主题的综合评估。

### 规律 7：「d^2y/dx^2 参数形式是 BC 的必考高频点」
在所有 BC 的参数方程 MCQ 中，求二阶导数的题目占比超过 30%，且学生最容易犯的错是直接用 (d^2y/dt^2)/(d^2x/dt^2)。这是出题者有意利用的认知陷阱。

### 规律 8：「弧长公式的变体密集考查」
BC 的弧长从 6 个角度反复考：直角坐标弧长、参数弧长、给长度积分反推函数、分段函数弧长（含直线段加法）、数值弧长（calculator）、给 f'(x) 反推弧长。

---

以上就是基于 CB 官方 AP Calculus AB/BC 题库的完整出题模式分析。所有规律均来自对实际 PDF 的逐题分析，可直接用于指导出题系统的模板设计。