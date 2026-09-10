# AP Computer Science A -- CB 出题者模式手册

---

## 第一部分：MCQ（选择题）出题模式

---

### 1. 题干结构分类（六大类型）

经统计分析，CB 的 MCQ 题干可以归纳为以下六种结构模板，按出现频率排列：

#### 类型 A：代码追踪型（占比约 40%）

**标志性问法**：
- "What is printed as a result of executing the code segment?"
- "What is the value of X after this code segment has been executed?"
- "What are the values of a, b, and c after this code segment has been executed?"
- "How many times will the string 'X' be printed?"
- "How many times will the print statement on line N execute?"

**结构模板**：
```
Consider the following code segment.
    [5-15 行 Java 代码]
What, if anything, is printed as a result of executing the code segment?
(A) 具体值1
(B) 具体值2
(C) 具体值3
(D) 具体值4
(E) Nothing is printed / runtime error / infinite loop
```

**出题特征**：
- 代码片段通常 5-15 行，含变量声明 + 控制逻辑 + 输出
- 必有 `System.out.print` / `System.out.println` 输出语句
- 选项全部是具体的输出值，其中一个选项通常是"无输出/报错/无限循环"
- 干扰项来源于**手动追踪时的常见计算错误**（差一、运算符优先级、字符串拼接vs数值加法）

**实际案例（来自 Basic Part 1 Q6）**：
```java
int m = 8; int n = 3;
if (m + n > 10) { System.out.print(m + n); }
if (m - n > 0) { System.out.print(m - n); }
```
答案 `115` -- 陷阱在于 print 不换行，两次输出拼接在一起。

#### 类型 B：代码补全型（占比约 25%）

**标志性问法**：
- "Which of the following can be used as a replacement for /\* missing code \*/ ?"
- "Which of the following should replace /\* missing loop header \*/ ?"
- "Which of the following can replace /\* missing expression \*/ ?"

**结构模板**：
```
Consider the following [incomplete] code segment, which is intended to [做什么].
    [代码，含 /* missing code */ 占位]
Which of the following can be used to replace /* missing code */ so that
the code segment works as intended?
(A) 代码片段1
(B) 代码片段2
...
```

**出题特征**：
- 题目会明确说明代码的**预期功能**（"intended to..."）
- 缺失部分通常是：循环条件、循环头、初始值、表达式
- 干扰项差异极小，通常只有 `<` vs `<=`、`>` vs `>=`、初始值差 1 等**差一错误（off-by-one）**

#### 类型 C：等价代码型（占比约 15%）

**标志性问法**：
- "Which of the following code segments could replace... without changing the value returned?"
- "Which of the following for loops produces the same output?"
- "Which of the following could be used in place of the given code segment to produce the same output?"

**结构模板**：
```
Consider the method [方法名] below.
    [完整代码]
Which of the following code segments could replace the [while/for] loop
without changing the value returned by the method?
    I. [代码段1]
    II. [代码段2]
    III. [代码段3]
(A) I only  (B) II only  (C) III only  (D) I and II  (E) II and III
```

**出题特征**：
- 大量使用 "I/II/III" 的罗马数字多选格式
- 考察 while-to-for 转换、for-each vs 传统 for、不同循环等价性
- 经典陷阱：for-each 循环中 x 是**值**不是**索引**（Unit 6 Q8/Q10 反复考）

#### 类型 D：缺陷诊断型（占比约 10%）

**标志性问法**：
- "Which of the following test cases can be used to show that the code does NOT work as intended?"
- "Which of the following best identifies why the code segment does not work as intended?"
- "For which of the following values does the code segment NOT print the correct value?"

**结构模板**：
```
[描述预期功能]
[含 bug 的代码]
Which of the following [values/test cases] can be used to show that the code
does NOT work as intended?
```

**出题特征**：
- 先描述"正确行为"，然后给出"有 bug 的实现"
- 考生需要找到**使 bug 暴露的测试用例**
- 经典 bug 类型：边界值遗漏（如 `<` 应为 `<=`）、if-else 链漏洞、循环初始值错误
- 如 Fibonacci 题（Unit 6 Q7）：`j=1` 应为 `j=2`，覆盖了已赋值的 `fibs[1]`

#### 类型 E：行为推理型（占比约 7%）

**标志性问法**：
- "Which of the following best explains how changing X to Y will change the result?"
- "Which of the following best describes the behavior of code segment I and code segment II?"

**结构模板**：
```
Consider the following code segment.
    [原始代码]
Which of the following best explains how changing [某修改] will change the result?
(A) [解释A - 文字描述]
(B) [解释B]
...
```

**出题特征**：
- 选项是**自然语言解释**，不是代码
- 考察对循环次数、边界条件、无限循环可能性的**概念理解**
- 常见于 `< n` 改为 `<= n`、`i++` 改为 `i += 2` 等微小改动的影响分析

#### 类型 F：概念/前置条件型（占比约 3%）

**标志性问法**：
- "What precondition is needed on the array so that the method will work as intended?"
- "Which of the following is the most appropriate precondition for the method?"
- "Which of the following code segments compile without error?"

**特征**：纯概念题，无需手动追踪，考察编译规则、precondition 推理、数组创建语法等

---

### 2. 选项设计模式（干扰项工程学）

CB 的干扰项不是随机的，而是按照**学生常见错误**精心设计。以下是提炼出的干扰项制造规则：

#### 规则 1：差一错误（Off-by-One）-- 最核心的陷阱

几乎所有循环相关题目都有差一干扰项：
- 正确答案：循环执行 8 次 --> 干扰项：7 次或 9 次
- `k >= 0` 的循环（k=35, k-=5）--> 正确 8 次，干扰项给 7（忘算 k=0 那次）
- `while (a > 1)` 其中 `a /= 2` --> 需要精确追踪 100->50->25->12->6->3->1，答案是 6

#### 规则 2：print vs println 拼接陷阱

多个 `System.out.print` 的输出会拼在一起：
- `print(11)` 后 `print(5)` --> 输出 `115` 不是 `11` 和 `5`
- 字符串拼接 `result += a` 其中 a=1 --> `"1"` 不是数值

**干扰项**：把拼接结果拆开（`11` 和 `5`），或把数值相加结果放进去

#### 规则 3：运算符优先级/布尔表达式陷阱

- `(3 + 4 == 5) != (3 + 4 >= 5)` --> `==` 优先级低于 `+`，先算 `3+4=7`
- `(a == !b) != false` --> 需要分清 `==` 和 `!=` 的布尔运算
- 干扰项包含 `5`、`7` 等数值（学生误以为是算术结果）和"无法运算"选项

#### 规则 4：数组索引越界 vs 正常运行

- 传统 for 循环 `arr[x + 3]` 搭配 `x < arr.length` --> 必然越界
- for-each `for (int x : arr)` --> x 是**值**，`x + 3` 是值加 3，不会越界
- Unit 6 Q10 经典：Code I 用索引运算越界，Code II 用 for-each 正常

干扰项设计：把两段代码的正确行为搞混，或者让学生以为两段等价

#### 规则 5：变量更新过程中的累积效应

- `arr[x+1] = arr[x] + arr[x+1]` 在循环中 --> 每次更新会影响下一次
- `{10,20,30,40,50}` 经过循环变成 `{10,20,50,90,140}` 不是 `{10,20,30,70,120}`
- 干扰项：忘记中间值已被更新，用原始值计算

#### 规则 6：for-each 循环的"E 选项"诱惑

涉及 for-each 语法的题目，几乎必有一个干扰项是**语法写反**的：
- 正确：`for (int x : numbers)`
- 干扰项：`for (numbers : int x)` -- 看起来有道理但编译不通过
- 还有一个用 `numbers[x]` 做二次索引的干扰项（for-each 的 x 已经是值了）

#### 规则 7：2D 数组的行列混淆

- `keyboard[2][2]` vs `keyboard[12]` -- 混淆一维索引和二维索引
- row-major 遍历中 `j < num.length` 应该是 `j < r.length` -- 列数取错
- 不等长行的处理（jagged array）

---

### 3. 代码片段复杂度分级

| 级别 | 行数 | 特征 | 典型 Unit |
|------|------|------|----------|
| L1 简单 | 3-5 行 | 单个表达式求值/单 if | Unit 1 基础 |
| L2 基础 | 5-10 行 | 多个串联 if/简单单循环 | Unit 3-4 |
| L3 中等 | 8-15 行 | 嵌套循环/数组+循环组合 | Unit 6 |
| L4 较难 | 10-20 行 | 嵌套循环+2D 数组+条件判断 | Unit 8 |
| L5 综合 | 15-25 行 | 含方法调用/类定义/多态 | Unit 9-10 |

**关键观察**：CB 的 MCQ 代码量严格控制在 **25 行以内**，但通过增加嵌套层数和数据结构复杂度来提升难度，而不是增加代码长度。

---

### 4. Java 概念考察分布（按 Unit）

| Unit | 核心概念 | MCQ 重点考法 |
|------|---------|------------|
| **Unit 1-2** | 基本类型/运算符/String | 表达式求值、类型转换、布尔表达式 |
| **Unit 3-4** | if/else/while/for | 条件链漏洞诊断、循环次数追踪、代码补全 |
| **Unit 5** | 类/对象/方法 | 构造器参数命名冲突（this.x）、accessor vs mutator |
| **Unit 6** | 数组 | 索引越界、数组遍历修改、数组初始化语法 |
| **Unit 7** | ArrayList | .size() vs .length、remove() 后索引位移、for-each 限制 |
| **Unit 8** | 2D 数组 | 行列遍历、初始化语法、行列索引混淆 |
| **Unit 9** | 继承 | super()调用、方法重写、多态行为 |
| **Unit 10** | 递归 | 递归调用追踪、base case 识别 |

**高频考点 TOP 5**（横跨所有 MCQ）：
1. **循环追踪**（for/while 的精确执行次数和输出） -- 出现率最高
2. **数组边界**（off-by-one、ArrayIndexOutOfBoundsException）
3. **代码补全**（填写缺失的循环条件/初始值）
4. **for-each vs 传统 for** 的等价性和差异
5. **嵌套循环**的执行次数和输出追踪

---

### 5. "What is printed?" 追踪题的专项模式

这类题在整套 MCQ 中占约 40%，是 **CB 的第一考核权重**。其变体包括：

| 变体 | 举例 | 陷阱 |
|------|------|------|
| 单循环输出 | `while(a < 20) { result += a; a += 5; }` | 字符串+=int 是拼接不是加法 |
| 多 if 输出 | 两个独立 if 各自 print | print 不换行，输出粘连 |
| 嵌套循环计数 | "How many times will line 6 execute?" | 外层5次 x 内层3次 = 15 |
| 累积变量 | `total += arr[k]` 在循环中 | 循环边界随 total 变化（动态边界） |
| 2D 数组遍历 | 跳步遍历 `j += 2` | 只输出偶数列，行数和列数需分开算 |

---

## 第二部分：FRQ（自由回答题）出题模式

---

### 1. FRQ 题目结构总览

每个 FRQ 大题包含 **2-4 个 Part**，分别标注 (a)、(b)、(c)、(d)。每个 Part 的任务类型有明确模式。

**通用题头（每题必有）**：
```
SHOW ALL YOUR WORK. REMEMBER THAT PROGRAM SEGMENTS ARE TO BE WRITTEN IN JAVA.

Assume that the classes listed in the Java Quick Reference have been imported.
Unless otherwise noted, assume that parameters in method calls are not null
and that methods are called only when their preconditions are satisfied.
In writing solutions for each question, you may use any of the accessible
methods that are listed in classes defined in that question. Writing
significant amounts of code that can be replaced by a call to one of these
methods will not receive full credit.
```

**关键规则**：题目明确告诉你**要复用已提供的方法**，如果你重写了等价逻辑会扣分。

---

### 2. FRQ 的四种题目类型

#### 类型 1：方法补全型（最常见）

**模式**：给定一个类的部分实现，要求补写 1-2 个方法。

**典型结构**（Unit 7 FRQ -- UserName 类）：
- 给出 `UserName` 类的框架（属性、已有方法 `isUsed`）
- (a) 写构造器：初始化 ArrayList，用 substring 生成用户名候选
- (b) 写 `setAvailableUserNames`：遍历 ArrayList 删除已使用的名字

**关键考察点**：
- ArrayList 的遍历中删除元素（必须用 `i--` 或反向遍历）
- 调用已提供的 helper 方法（如 `isUsed()`）
- String 的 `substring()` 用法

#### 类型 2：完整类编写型

**模式**：给出类的功能描述和示例行为表，要求从头写完整类。

**典型结构**（Unit 5 FRQ Q2 -- PasswordGenerator 类）：
- 给出一张"代码执行序列 --> 预期结果"的表格
- 要求写出完整类：private 变量、构造器（含重载）、方法

**关键考察点**：
- `static` 变量 vs 实例变量的区分（所有对象共享计数器 = static）
- 构造器重载（两参数 vs 单参数，默认值处理）
- `Math.random()` 的使用：`(int)(Math.random() * 10)` 生成 0-9

#### 类型 3：继承体系编写型

**模式**：给出父类代码，要求编写子类（甚至孙类）。

**典型结构**（Unit 9 FRQ Q1 -- Book/PictureBook/BookListing）：
- 给出 `Book` 类（title, author, printBookInfo）
- (a) 写 `PictureBook extends Book`：新增 illustrator，重写 printBookInfo
- (b) 写对象创建代码（多态赋值）
- (c) 写 `BookListing` 类（组合模式，含 Book 属性）

**典型结构**（Unit 9 FRQ Q2 -- Animal/Herbivore/Elephant）：
- (a) 写完整 `Animal` 类（3 个属性 + 构造器 + toString）
- (b) 写 `Herbivore extends Animal`（构造器用 super 传递 "herbivore"）
- (c) 写 `Elephant extends Herbivore`（新增 tuskLength，重写 toString 用 super.toString()）

**关键考察点**：
- `super()` 调用必须是构造器第一行
- `super.方法名()` 在子类中调用父类方法
- 方法重写（@Override 虽然不要求但建议）
- 多态：`Book book2 = new PictureBook(...)` 的声明类型 vs 实际类型

#### 类型 4：方法/构造器修错型

**模式**：给出有 bug 的代码，要求写正确版本。

**典型结构**（Unit 5 FRQ Q1 Part D -- Invitation 构造器）：
- 给出一个构造器 `public Invitation(String address)` 其中 `address = address` 是自赋值 bug
- 要求：写出正确的构造器（改参数名 或 使用 `this.address`）

---

### 3. FRQ 评分体系详解

#### 评分基本单位：Point（每个得分点 +1）

每个 Part 有 1-9 个得分点，每个得分点标注了对应的 **Skill 编号**：

| Skill 编号 | 含义 | 考察内容 |
|-----------|------|---------|
| **3.A** | 调用已有方法/使用多态 | 正确调用 super()、使用 helper 方法、多态行为 |
| **3.B** | 声明/实现类/方法 | 正确的方法签名、构造器、变量声明、返回类型 |
| **3.C** | 算法逻辑 | 循环、条件、随机数生成、字符串构造 |
| **3.D** | 数据结构操作 | ArrayList 遍历/添加/删除、数组访问 |

#### 典型得分点分解

**简单 getter 方法（2分）**：
- +1 正确方法头（public String getHostName()）
- +1 返回正确变量（return hostName;）

**构造器（1-3分）**：
- +1 正确方法头 + 参数
- +1 使用 super() 调用父类构造器
- +1 初始化新增实例变量

**复杂方法（4-5分）**：
- +1 构造/初始化数据结构
- +1 正确的循环结构
- +1 在循环中正确访问元素
- +1 正确的算法逻辑（如 substring 拼接）
- +1 正确地添加/删除元素

**完整类（9分）**：
- +1 声明 private 实例变量
- +1 static 变量使用正确
- +1 构造器1（多参数）
- +1 构造器2（少参数/默认值）
- +1 随机数生成正确
- +1 循环生成指定位数
- +1 字符串拼接格式正确
- +1 计数器递增
- +1 返回计数器值

#### 通用扣分项（General Penalties，每类最多扣 1 分）

| 代号 | 扣分原因 | 说明 |
|------|---------|------|
| **(v)** | Array/Collection 访问混淆 | `[]` 和 `.get()` 混用 |
| **(w)** | 多余的副作用代码 | 不该 print 的地方 print 了、多余的 precondition 检查 |
| **(x)** | 使用了未声明的局部变量 | 忘记声明变量类型 |
| **(y)** | 破坏了持久性数据 | 修改了不该修改的参数引用 |
| **(z)** | void 方法返回了值 / 构造器返回了值 | 类型混淆 |

**重要规则**：每类扣分最多扣 1 分，即使犯了多次同类错误。

---

### 4. FRQ 代码量和难度分析

| Part | 典型代码量 | 难度 | 分值范围 |
|------|---------|------|---------|
| (a) 简单方法 | 2-5 行 | 低 | 1-2 分 |
| (b) 中等方法 | 5-10 行 | 中 | 2-5 分 |
| (c) 复杂方法/完整类 | 10-20 行 | 高 | 3-9 分 |
| (d) 修错/小改动 | 2-5 行 | 中 | 1 分 |

**代码补全 vs 从头编写的比例**：约 **6:4** -- 多数 Part 是在给定类框架中补写方法，少数要求写完整类。

---

### 5. FRQ 高频考点和陷阱

#### 陷阱 1：ArrayList 遍历中删除元素

这是 CB 最爱考的 FRQ 陷阱之一（Unit 7 FRQ）：
- 正向遍历 + remove 会跳过元素 --> 必须 `i--`
- 或者反向遍历 `for (int i = list.size()-1; i >= 0; i--)`
- CB 会同时给出两种 Canonical Solution

#### 陷阱 2：构造器参数名遮蔽（Shadowing）

- `public Invitation(String address)` 中 `address = address` 是自赋值
- 解决方案：改参数名（`String a`）或用 `this.address = address`

#### 陷阱 3：super() 的位置和参数传递

- 子类构造器中 `super()` 必须在第一行
- 传递固定值：`super("herbivore", s, n)` -- 硬编码分类字符串
- 子类 toString 复用：`return super.toString() + " with tusks " + tuskLength + " meters long"`

#### 陷阱 4：static vs instance 变量

- 所有对象共享的计数器必须声明为 `private static int`
- CB 评分会单独给 static 一个得分点

---

## 第三部分：综合出题规律

---

### 1. CB 出题者的核心原则

1. **测试理解，不测试记忆** -- 几乎不考 API 记忆，只考你能否正确追踪代码执行
2. **微小差异，巨大影响** -- `<` vs `<=`、`print` vs `println`、`i=0` vs `i=1`
3. **陷阱来自真实错误** -- 每个干扰项对应一种真实的学生常见错误
4. **从简单到复杂递进** -- 同一张试卷中，前面的题目较简单，后面的较复杂
5. **复用是美德** -- FRQ 中不复用已提供的方法会扣分

### 2. 题目背景设计模式

CB 偏好使用**日常场景**作为代码背景，而不是抽象的算法描述：

| 场景 | 出现的类/概念 |
|------|-----------|
| 派对邀请 | Invitation 类（getter/setter/toString） |
| 密码生成器 | PasswordGenerator 类（static 计数、随机数） |
| 用户名系统 | UserName 类（ArrayList、substring、remove） |
| 图书管理 | Book/PictureBook/BookListing（继承、多态、组合） |
| 动物保护区 | Animal/Herbivore/Elephant（三层继承） |
| 温度转换 | if-else 链的范围判断 |
| 键盘布局 | 2D String 数组索引 |

### 3. 面向出题的代码生成规则

如果要生成 CB 风格的题目，需遵循以下规则：

**MCQ 生成规则**：
- 代码必须语法正确且可编译（除非题目问"哪个不编译"）
- 至少一个干扰项基于 off-by-one 错误
- 至少一个干扰项基于对 Java 特定行为的误解
- 选项 (E) 通常是"极端情况"（无输出/报错/无限循环/不编译）
- 变量名使用单字母或简短名（a, b, c, arr, num, total）
- 代码缩进一致，使用标准 Java 花括号风格

**FRQ 生成规则**：
- 必须提供完整的类框架和已有方法
- 必须提供示例输入/输出表格
- 每个 Part 的得分点必须可拆分为独立的评判标准
- 评分标准必须支持多种正确解法（给出 Canonical + Alternate Solution）
- 通用扣分项必须独立于得分项（不影响正确部分的得分）

---

这份手册基于对以下 CB 官方材料的深度分析：
- `/Users/martin/Downloads/CB/03AP CSA/CB题/CSA AP ClassRoom MCQ.pdf`（MCQ 约 50+ 题，覆盖 Basic Part 1/2 + One-D Array）
- `/Users/martin/Downloads/CB/03AP CSA/CB题/SG_Unit5ProgressCheckFRQ_*.pdf`（Unit 5 FRQ，类设计）
- `/Users/martin/Downloads/CB/03AP CSA/CB题/SG_Unit6ProgressCheckMCQ_*.pdf`（Unit 6 MCQ，数组）
- `/Users/martin/Downloads/CB/03AP CSA/CB题/SG_Unit7ProgressCheckFRQ_*.pdf`（Unit 7 FRQ，ArrayList）
- `/Users/martin/Downloads/CB/03AP CSA/CB题/SG_Unit8ProgressCheckMCQ_*.pdf`（Unit 8 MCQ，2D 数组）
- `/Users/martin/Downloads/CB/03AP CSA/CB题/SG_Unit9ProgressCheckFRQ_*.pdf`（Unit 9 FRQ，继承）
