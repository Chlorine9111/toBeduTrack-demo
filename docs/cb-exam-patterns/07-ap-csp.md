# AP Computer Science Principles -- CB 出题者模式手册

---

## 第一部分：考试结构总览

### 1.1 考试格式演变

| 年份 | 总题数 | 单选题 (Q1-Q59/60/62) | 双选题 (Q131-Q137/138) | 时长 | 占总分 |
|------|------|---------------------|---------------------|------|------|
| 2018 | 66 | Q1-Q59（59 题） | Q131-Q137（7 题） | 2 小时 | 60% |
| 2020 | 67 | Q1-Q60（60 题） | Q131-Q137（7 题） | 2 小时 | 60% |
| 2021 | 70 | Q1-Q62（62 题） | Q131-Q138（8 题） | 2 小时 | 70% |

**关键变化**：2021 年取消了 Create Performance Task 在考试中的权重，MCQ 从 60% 提升至 70%，题目数量从 66/67 增加到 70。

### 1.2 题目编号规则

- Q1-Q59/60/62：标准四选一单选
- Q131-Q137/138：四选二双选（需选出两个最佳答案）
- 编号从 Q59/60/62 直接跳到 Q131，中间没有题目

### 1.3 参考材料（Reference Sheet）

考试自带的参考材料覆盖 8 个编程指令类别：
1. Assignment, Display, and Input（赋值、显示、输入）
2. Arithmetic Operators and Numeric Procedures（算术运算）
3. Relational and Boolean Operators（关系和布尔运算）
4. Selection（选择结构）
5. Iteration（循环结构）
6. List Operations（列表操作）
7. Procedures（过程/函数）
8. Robot（机器人指令）

每种指令同时提供 **Text 格式**和 **Block 格式**两种表示。

---

## 第二部分：CB 伪代码系统深度分析

### 2.1 赋值语法

```
变量名 <- 表达式
```

**关键特征**：
- 使用左箭头 `<-` 而非等号
- Block 模式下显示为方框内的 `变量 <-- 表达式`
- 列表赋值：`list <- [value1, value2, value3]`
- 列表索引从 **1** 开始（非 0！这是最大的坑）

### 2.2 循环结构

| 语法 | 含义 | 出题频率 |
|------|------|---------|
| `REPEAT n TIMES` | 固定次数循环 | 极高 |
| `REPEAT UNTIL (condition)` | 条件循环（先判断后执行） | 高 |
| `FOR EACH item IN list` | 列表遍历 | 中高 |

### 2.3 过程（Procedure）

```
PROCEDURE name (parameter1, parameter2, ...)
{
    <instructions>
    RETURN (expression)    // 可选
}
```

**2021 年变化**：Reference Sheet 中 Procedures 改名为 "Procedures and Procedure Calls"，增加了 `RETURN(expression)` 的独立说明。

### 2.4 机器人指令系统

| 指令 | 含义 |
|------|------|
| `MOVE_FORWARD()` | 向面朝方向前进一格 |
| `ROTATE_LEFT()` | 原地逆时针转 90 度 |
| `ROTATE_RIGHT()` | 原地顺时针转 90 度 |
| `CAN_MOVE(direction)` | 检测某方向是否可移动，direction 可为 left/right/forward/backward |

**机器人题目的固定模式**：
- 网格上有黑色区域（不可通过）、白色区域（可通过）、灰色方格（目标）
- 机器人用三角形表示，三角形朝向指示面朝方向
- 通常结合 `REPEAT UNTIL(goalReached())` 使用

---

## 第三部分：MCQ 题型分类与出题模式

### 3.1 题干结构分类

基于对三套考试约 200 道题的分析，题目可分为以下核心类型：

#### 类型 A：代码追踪题（Code Tracing）-- 占比约 25-30%

**模式**：给出一段伪代码，问执行后变量的值或输出结果。

**典型句式**：
- "What is displayed as a result of executing the program?"
- "Which of the following expressions represents the value stored in the variable x?"
- "What are the values of first and second as a result of executing the code segment?"

**出题手法**：
1. **变量交换题**（经典高频）：用 temp 变量交换两个值，问缺失的代码或最终结果
   - 2018 Q1：temp/first/second 交换，填 `<MISSING CODE>`
   - 2021 Q3：直接追踪 first/second/temp 的值变化
2. **循环累积题**：初始化变量后循环修改
   - 2020 Q1：`x <- 2; REPEAT 4 TIMES { x <- x * 3 }`，选项为数学表达式 `2*3*3*3*3`
3. **嵌套循环输出题**：追踪嵌套 REPEAT 的输出序列
   - 2020 Q3/Q5：给定输出模式如 "red red blue red red blue"，选正确的嵌套循环
   - 2021 Q5：同样模式的 "up down down down" 嵌套循环

**干扰项手法**：
- 循环次数偏移（多一次或少一次）
- 内外循环嵌套位置互换
- 变量更新顺序错误（先更新后使用 vs 先使用后更新）

#### 类型 B：代码选择/补全题（Code Selection）-- 占比约 20-25%

**模式**：给出需求描述或价格表，从 4 个代码段中选出正确实现。

**典型句式**：
- "Which of the following code segments correctly sets/displays the value of..."
- "Which of the following can be used to replace `<MISSING CODE>` so that the code works as intended?"

**经典题型**：
1. **票价/费用计算题**（每套考试必考 1-2 题）
   - 2018 Q5：电影票价 = 基础价 + 年龄折扣 + 3D 附加费
   - 2020 Q10：博物馆票价 = 年龄 + 导游费
   - 给出一张价格表，让学生选择正确的 IF/ELSE 嵌套逻辑
   - **干扰项手法**：IF 条件用 OR 还是 AND、是否用 ELSE、加法是绝对值还是增量

2. **概率模拟题**：用 RANDOM 模拟不等概率事件
   - 2018 Q11：不等扇区面积的转盘，用 RANDOM(1,3) + IF 映射

#### 类型 C：概念理解题（Conceptual Understanding）-- 占比约 30-35%

**模式**：纯文字题，考察 CS 概念的理解。

**高频考点分布**：

| 概念领域 | 具体考点 | 出题频率 |
|---------|---------|---------|
| **互联网 & 网络** | IETF 的角色、IP 地址、DNS、冗余路由、容错性、带宽 | 每套 5-8 题 |
| **网络安全** | 钓鱼攻击、公钥加密、多因素认证、强密码 | 每套 3-5 题 |
| **数据表示** | 二进制/十进制转换、RGB 颜色、overflow、lossy vs lossless | 每套 3-5 题 |
| **计算影响** | 数字鸿沟、隐私、版权/Creative Commons、计算偏差 | 每套 3-5 题 |
| **软件开发** | 迭代开发、协作、公民科学、模拟与建模 | 每套 3-4 题 |

**典型句式**：
- "Which of the following best describes..."
- "Which of the following is LEAST likely to be..."
- "Which of the following is NOT a benefit of..."

**干扰项手法**：
- **绝对化措辞**是错误选项的标志："eliminates the need for..."、"prevents all..."
- 选项中混入真实但不相关的事实
- 概念之间的细微混淆（如 Internet vs World Wide Web）

#### 类型 D：数据分析/推理题（Data Analysis）-- 占比约 10-15%

**模式**：给出数据集描述或表格/图表，问什么能或不能从数据中推断。

**典型句式**：
- "Which of the following can be determined using the data described above?"
- "Which of the following CANNOT be determined from the information collected?"
- "Which of the following is the best explanation..."（数据趋势判断）

**经典模式**：
1. 给出数据库字段列表，问哪些查询可以/不可以完成
   - 2018 Q8：手机照片数据（文件名、日期、地点）→ 能否推断拍照者
   - 2020 Q13：图书馆借阅数据 → 不能查"从未被借过的书"（因为只记录了借出的）
2. 给出统计图表，问最佳趋势解释

**核心考察**："数据中没有的字段"无法推断 -- 这是最常见的考点

#### 类型 E：机器人/网格题（Robot Grid）-- 占比约 5-8%

**模式**：网格上移动机器人到目标位置。

**出题模式**：
1. **确定性路径**：固定步骤的 REPEAT + MOVE/ROTATE 组合
2. **自适应路径**：`REPEAT UNTIL(goalReached)` + `IF(CAN_MOVE(forward))` 的组合
3. **双程序对比**：给出 Program I 和 Program II，判断哪个正确

**干扰项手法**：
- ROTATE_LEFT vs ROTATE_RIGHT 混淆
- CAN_MOVE(forward) vs CAN_MOVE(left) 的方向理解
- 有无 ELSE 分支导致的行为差异
- 程序在边界处的终止条件

#### 类型 F：程序调试/纠错题（Debugging）-- 占比约 5%

**模式**：给出有 bug 的程序（带行号），问需要做什么修改。

**典型句式**：
- "Which of the following changes is needed for the program to work as intended?"

**经典考法**：
- 2021 Q14：`isIncreasing` 过程的 RETURN(true)/RETURN(false) 位置颠倒
- 选项通常是具体的行号修改建议

---

## 第四部分：选项设计与干扰项手法

### 4.1 干扰项设计的七大模式

1. **Off-by-One 错误**：循环多一次/少一次、索引偏移 1
2. **条件逻辑反转**：AND/OR 互换、忘记 NOT、边界条件包含/不包含
3. **执行顺序错误**：先赋值后判断 vs 先判断后赋值
4. **变量混淆**：temp/first/second 的赋值方向搞反
5. **绝对化表述**：在概念题中使用 "all"、"always"、"eliminates"、"prevents" 等绝对词
6. **部分正确**：选项中一半描述正确但另一半错误
7. **范围混淆**：IF 条件覆盖范围不足或过多

### 4.2 正确答案的特征

- 概念题中，正确答案通常用 **限定词**："often"、"can"、"may"、"generally"
- 代码题中，正确答案通常是逻辑最简洁且完整处理所有边界的选项
- 数据题中，正确答案严格对应数据集中实际存在的字段

---

## 第五部分：知识领域分布（基于 CB 官方框架）

### 5.1 2018 年框架（Big Ideas）

答案解析中每题标注了 Enduring Understanding（EU）编号：

| Big Idea | 编号 | 占比估算 |
|----------|------|---------|
| **2** - Creative Development / Data | 2.1 数据抽象, 2.3 模拟建模 | ~15% |
| **3** - Data and Information | 3.1 数据洞察, 3.2 数据提取, 3.3 数据压缩 | ~15% |
| **4** - Algorithms | 4.1 算法实现 | ~20% |
| **5** - Programming | 5.1 程序开发, 5.2 算法执行, 5.3 抽象, 5.4 程序正确性, 5.5 数学逻辑 | ~25% |
| **6** - The Internet | 6.1 网络结构, 6.2 网络特性, 6.3 网络安全 | ~15% |
| **7** - Global Impact | 7.1 协作/公民科学, 7.3 利弊影响, 7.4 社会文化 | ~10% |

### 5.2 2021 年框架（新版 5 Big Ideas + Skills）

2021 年答案解析切换到新框架：

| 新 Big Idea | 对应 Topic | 出题占比 |
|------------|-----------|---------|
| **CRD** - Creative Development | 1.1 Collaboration, 1.4 Error Correction | ~8% |
| **DAT** - Data | 2.1 Binary, 2.2 Compression | ~12% |
| **AAP** - Algorithms and Programming | 3.1-3.17（变量、选择、循环、列表、过程、算法） | ~40% |
| **CSN** - Computing Systems & Networks | 4.1 Internet, 4.2 Fault Tolerance, 4.3 Parallel Computing | ~18% |
| **IOC** - Impact of Computing | 5.1-5.6（社会影响、数字鸿沟、偏差、安全、合法与伦理） | ~22% |

**最核心发现**：**算法与编程（AAP）占比约 40%**，是绝对的重心。

### 5.3 计算思维实践（Computational Thinking Practices）分布

| Practice | 名称 | 2018 框架 | 2021 框架 |
|----------|------|---------|---------|
| P1 | Connecting Computing | ~15% | -- |
| P2 | Creating Computational Artifacts | ~25% | 2.B: Implement and apply an algorithm |
| P3 | Abstracting | ~25% | 3.B/C: Use abstraction |
| P4 | Analyzing Problems and Artifacts | ~25% | 4.B/C: Determine result / Identify errors |
| P5 | Communicating | ~10% | 5.A/E: Explain / Evaluate |

2021 年新框架下的 Skills：
- **1.C/1.D**: Explain collaboration / Evaluate solution options
- **2.A/2.B**: Represent algorithmic processes / Implement algorithms
- **3.B/3.C**: Use abstraction to manage complexity
- **4.B/4.C**: Determine result of code / Identify errors
- **5.A/5.E**: Explain how systems work / Evaluate computing ethics

---

## 第六部分：高频出题模式速查表

### 6.1 必考题型（每套考试必出）

| 题型 | 具体模式 | 难度 |
|------|---------|------|
| 变量交换 | temp + first + second 三变量赋值追踪 | 简单 |
| 票价/费用计算 | 价格表 + 嵌套 IF/ELSE 选择 | 中等 |
| 嵌套循环输出 | 给定输出序列，选择正确的 REPEAT 嵌套 | 中等 |
| 机器人网格 | MOVE_FORWARD + ROTATE + CAN_MOVE 组合 | 中-难 |
| 二进制转换 | 十进制/二进制互转、RGB 颜色表示 | 简单-中等 |
| 数据推理 | 给定数据集字段，判断可查询/不可查询的信息 | 中等 |
| 网络安全 | 钓鱼/加密/认证/密码安全 | 简单 |
| 冗余路由/容错 | 网络拓扑图 + 移除节点后的连通性 | 中等 |
| 模拟/建模 | 什么场景适合用 Boolean/模拟、模拟的优缺点 | 简单 |
| 协作/开发流程 | 迭代开发/协作的好处（含"NOT a benefit"反向提问） | 简单 |

### 6.2 高阶难题模式（区分度高）

| 题型 | 特征 | 解题关键 |
|------|------|---------|
| 多步列表操作 | INSERT/REMOVE/APPEND 组合后的列表状态 | 画表格逐步追踪 |
| 过程调用嵌套 | PROCEDURE A 调用 PROCEDURE B，追踪返回值 | 理解 RETURN 中断 |
| 算法等价性判断 | 两段代码是否产生相同结果 | 边界值测试法 |
| 逻辑门电路 | 给出 AND/OR/NOT 门组合，求输出 | 逐级推导 |
| 无限循环判断 | 什么输入值会导致 REPEAT UNTIL 永不终止 | 分析终止条件 |
| 数据压缩 | lossy vs lossless、byte pair encoding | 理解可逆性 |

---

## 第七部分：选项设计规律总结

### 7.1 代码题选项排列规则

- **Block 模式选项**通常按 (A)(B)(C)(D) 横向 2x2 排列
- **Text 模式选项**通常按 (A)(B)(C)(D) 纵向排列
- 4 个代码段通常只有 1-2 个"看起来差不多"，另外 2 个有明显结构差异
- 选项间的差异通常很小：一个变量名不同、一个运算符不同、一行代码位置不同

### 7.2 概念题选项排列规则

- 正确答案在 ABCD 的分布大致均匀
- 带有绝对词的选项几乎都是错的（"eliminates"、"guarantees"、"always"、"all"）
- 带有限定词的选项更可能是对的（"can"、"may"、"often"、"generally helpful"）
- I/II/III 组合题中，"I, II, and III" 通常是正确答案（考察全面理解）

### 7.3 反向提问标志词

以下措辞表示要选**错误/最不可能**的选项：
- "Which is **NOT** a benefit..."
- "Which is **LEAST** likely..."
- "Which **CANNOT** be determined..."

---

## 第八部分：年份间的趋势变化

### 8.1 伪代码表示的变化

| 特征 | 2018 | 2020 | 2021 |
|------|------|------|------|
| 列表变量名 | `list` | `list` | `aList` |
| 过程部分标题 | "Procedures" | "Procedures" | "Procedures and Procedure Calls" |
| DISPLAY 格式 | `DISPLAY (expression)` | `DISPLAY (expression)` | `DISPLAY(expression)` |
| MOD 描述 | "a and b are positive integers" | 同左 | "a >= 0 and b > 0" |
| RANDOM 描述 | "evaluates to a random integer" | 同左 | "generates and returns a random integer; Each result is equally likely" |

### 8.2 题目难度趋势

- **2018**：概念题较多，编程题相对简单
- **2020**：编程题难度提升，出现更多多步追踪题
- **2021**：新增更多"算法等价性"和"程序调试"题型，网络拓扑图题增加

### 8.3 新增考点（2021 年）

- **Computing Bias**（计算偏差）：算法训练数据的代表性
- **Creative Commons Licensing**：no-rights-reserved 许可证
- **Lossy vs Lossless Compression** 题目增加
- **Parallel and Distributed Computing**：并行计算的适用场景

---

## 第九部分：出题模板（供出题参考）

### 模板 1：代码追踪题

```
Consider the following program.

    [给出 3-8 行伪代码，包含赋值和循环]

What is displayed as a result of executing the program?

(A) [正确值的某个中间状态]
(B) [循环少一次的结果]
(C) [正确答案]
(D) [循环多一次的结果]
```

### 模板 2：票价选择题

```
The [场景] prices are given below.

    [价格表：2-3 行分类]
    [附加条件：如 3D/导游/会员]

A programmer is creating an algorithm to set the value of [变量] based on
the information in the table. The programmer uses [变量列表].

Which of the following code segments correctly [sets/displays] the value?

(A) [条件逻辑用 OR 但应该用 AND]
(B) [ELSE 放错位置]
(C) [正确：初始化 + 条件修改 + 附加条件修改]
(D) [缺少对某种情况的处理]
```

### 模板 3：数据推理题

```
A [系统名称] stores the following data for each [对象]:
    - [字段 1]
    - [字段 2]
    - [字段 3]

Assume that all [对象] data is accessible. Which of the following
[can/CANNOT] be determined using the data described above?

    I. [可以从字段推断的信息]
    II. [可以从字段推断的信息]
    III. [无法推断因为缺少相关字段]

(A) III only
(B) I and II only  ← 通常是正确答案
(C) I and III only
(D) I, II, and III
```

### 模板 4：网络概念题

```
Which of the following best describes [互联网概念]?

(A) [混淆概念 A 和 B 的描述]
(B) [使用绝对化措辞的错误描述]
(C) [正确但使用限定词的描述]
(D) [相关但不相关领域的描述]
```

---

## 第十部分：关键考试策略提示

### 对于出题者：

1. **算法题占 40%** -- 必须是出题重心
2. **每种 Big Idea 都要覆盖** -- 不能只出编程题
3. **双选题（Q131+）**应放难度偏高的综合题
4. **必须包含**至少 1 道机器人题、2 道网络拓扑图题、2 道二进制转换题
5. **干扰项必须有教学意义** -- 每个错误选项对应一种常见误解
6. **代码同时提供 Text 和 Block 两种格式**（或选其一，CB 两种都用）
7. **避免纯记忆题** -- CB 偏好"应用到新情境"的理解性考察

### 正确答案分布规律：
- ABCD 大致均匀
- 不会连续 5+ 题答案相同
- 双选题的两个正确答案通常不相邻（如 AC、BD 比 AB、CD 更常见）

---

本手册基于以下文件的深度分析：
- `/Users/martin/Downloads/CB/06AP 计算机CSP/practice exam/ap-computer-science-principles-2018-practice-exam-mcq.pdf` 及其答案
- `/Users/martin/Downloads/CB/06AP 计算机CSP/practice exam/ap-computer-science-principles-2020-practice-exam-1-mcq.pdf` 及其答案
- `/Users/martin/Downloads/CB/06AP 计算机CSP/practice exam/ap-computer-science-principles-practice-exam-and-notes-2021-mcq.pdf` 及其答案
