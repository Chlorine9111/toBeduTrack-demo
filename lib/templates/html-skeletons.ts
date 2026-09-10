function wrapTemplateArticle(documentType: string, innerHtml: string) {
  return `<article data-doc-type="${documentType}">${innerHtml.trim()}</article>`;
}

export const TEMPLATE_HTML_SKELETONS = {
  rubricApGeneric: wrapTemplateArticle(
    "rubric",
    `
      <section data-section="header">
        <p>Rubric</p>
        <h1>[科目名称] 评分量规</h1>
        <p>适用于 AP 课程课堂任务、讨论表现或阶段性写作。</p>
      </section>
      <table data-rubric="true">
        <thead>
          <tr>
            <th>维度</th>
            <th>4 - Exemplary</th>
            <th>3 - Proficient</th>
            <th>2 - Developing</th>
            <th>1 - Beginning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>知识准确性</strong></td>
            <td>概念无误，术语规范，逻辑严密。</td>
            <td>核心概念正确，个别表述不够精确。</td>
            <td>存在局部误解，论证不够完整。</td>
            <td>关键概念混淆，难以支撑结论。</td>
          </tr>
          <tr>
            <td><strong>分析深度</strong></td>
            <td>[填写本科目的高阶表现标准]</td>
            <td>[填写达到标准的表现]</td>
            <td>[填写尚需改进的表现]</td>
            <td>[填写起步阶段的表现]</td>
          </tr>
          <tr>
            <td><strong>表达规范</strong></td>
            <td>[填写]</td>
            <td>[填写]</td>
            <td>[填写]</td>
            <td>[填写]</td>
          </tr>
        </tbody>
      </table>
      <p><em>总分 = 各维度得分之和。满分 12 分，可按任务调整权重。</em></p>
    `,
  ),
  rubricLabReport: wrapTemplateArticle(
    "rubric",
    `
      <section data-section="header">
        <p>Rubric</p>
        <h1>实验报告评分标准</h1>
        <p>适用于 AP Chemistry / AP Physics 实验报告与实验反思。</p>
      </section>
      <table data-rubric="true">
        <thead>
          <tr>
            <th>维度</th>
            <th>4 - Advanced</th>
            <th>3 - Meets</th>
            <th>2 - Partial</th>
            <th>1 - Limited</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>假设提出</strong></td>
            <td>假设清晰、可检验，并与理论充分对应。</td>
            <td>假设明确，可基本支撑实验。</td>
            <td>假设较模糊，和实验目标联系较弱。</td>
            <td>缺少明确假设或不可检验。</td>
          </tr>
          <tr>
            <td><strong>实验设计</strong></td>
            <td>[填写变量控制、步骤合理性标准]</td>
            <td>[填写]</td>
            <td>[填写]</td>
            <td>[填写]</td>
          </tr>
          <tr>
            <td><strong>数据记录与误差分析</strong></td>
            <td>[填写]</td>
            <td>[填写]</td>
            <td>[填写]</td>
            <td>[填写]</td>
          </tr>
          <tr>
            <td><strong>结论推导</strong></td>
            <td>[填写]</td>
            <td>[填写]</td>
            <td>[填写]</td>
            <td>[填写]</td>
          </tr>
        </tbody>
      </table>
    `,
  ),
  lessonConcept: wrapTemplateArticle(
    "lesson-plan",
    `
      <section data-section="header">
        <p>Lesson Plan</p>
        <h1>[知识点名称] — 概念讲解课</h1>
        <p>面向 AP 课堂的标准概念讲解模板，可直接替换成具体单元内容。</p>
      </section>
      <h2>基本信息</h2>
      <ul>
        <li><strong>科目</strong>：AP [填写科目]</li>
        <li><strong>单元</strong>：Unit [__] - [单元名称]</li>
        <li><strong>时长</strong>：[__] 分钟</li>
        <li><strong>前置知识</strong>：[学生已掌握内容]</li>
      </ul>
      <h2>1. 导入情境（5 min）</h2>
      <p>[用一个贴近生活的问题或现象引入，激发学生思考]</p>
      <h2>2. 概念定义（8 min）</h2>
      <p>[板书正式定义，标注关键术语，让学生复述]</p>
      <h2>3. 原理展开（10 min）</h2>
      <p>[解释背后原理，结合图示 / 公式]</p>
      <h2>4. 例题演示（10 min）</h2>
      <p>[至少一道完整例题，演示解题步骤]</p>
      <h2>5. 理解检验（8 min）</h2>
      <p>[2-3 道快速检测题，当堂反馈]</p>
      <h2>6. 小结与延伸（4 min）</h2>
      <p>[一句话总结核心概念 + 布置课后任务]</p>
    `,
  ),
  lessonExample: wrapTemplateArticle(
    "lesson-plan",
    `
      <section data-section="header">
        <p>Lesson Plan</p>
        <h1>[题型名称] — 例题演练课</h1>
        <p>适合 AP 题型专项讲评与训练。</p>
      </section>
      <h2>基本信息</h2>
      <ul>
        <li><strong>科目</strong>：AP [填写科目]</li>
        <li><strong>目标题型</strong>：[MCQ / FRQ / DBQ / LEQ]</li>
        <li><strong>时长</strong>：[__] 分钟</li>
      </ul>
      <h2>1. 方法回顾（6 min）</h2>
      <p>[复盘该题型的核心步骤或评分标准]</p>
      <h2>2. 基础题演示（8 min）</h2>
      <p>[用一道基础题示范解题流程]</p>
      <h2>3. 进阶题分步练习（12 min）</h2>
      <p>[分步拆解，要求学生口头说明思路]</p>
      <h2>4. 综合题独立完成（12 min）</h2>
      <p>[学生独立完成，再同伴互查或全班讲评]</p>
      <h2>5. 方法总结（7 min）</h2>
      <p>[整理常见错误、速查步骤和考试提醒]</p>
    `,
  ),
  lessonSprint: wrapTemplateArticle(
    "lesson-plan",
    `
      <section data-section="header">
        <p>Lesson Plan</p>
        <h1>[单元名称] — 冲刺复习课</h1>
        <p>用于考试前的高频考点回顾与限时训练。</p>
      </section>
      <h2>基本信息</h2>
      <ul>
        <li><strong>科目</strong>：AP [填写科目]</li>
        <li><strong>复习范围</strong>：[Unit / Topic]</li>
        <li><strong>时长</strong>：[__] 分钟</li>
      </ul>
      <h2>1. 考点速览（8 min）</h2>
      <p>[用提纲或图表快速过一遍重点概念]</p>
      <h2>2. 高频题型（10 min）</h2>
      <p>[列出最常考的 2-3 类题型及解题提醒]</p>
      <h2>3. 易错点提醒（8 min）</h2>
      <p>[记录易错概念、单位、表达方式、历史陷阱]</p>
      <h2>4. 限时模拟（12 min）</h2>
      <p>[安排一轮 mini timed practice]</p>
      <h2>5. 答题策略收束（7 min）</h2>
      <p>[总结时间分配、关键词和提分建议]</p>
    `,
  ),
  lessonInquiry: wrapTemplateArticle(
    "lesson-plan",
    `
      <section data-section="header">
        <p>Lesson Plan</p>
        <h1>[主题名称] — 探究式教学教案</h1>
        <p>从问题抛出到概念浮现，适合讨论型或实验型课堂。</p>
      </section>
      <h2>基本信息</h2>
      <ul>
        <li><strong>科目</strong>：AP [填写科目]</li>
        <li><strong>探究问题</strong>：[核心驱动问题]</li>
        <li><strong>时长</strong>：[__] 分钟</li>
      </ul>
      <h2>1. 问题抛出（5 min）</h2>
      <p>[用现象、案例或冲突问题开启]</p>
      <h2>2. 引导探索（10 min）</h2>
      <p>[学生观察、讨论、预测或实验记录]</p>
      <h2>3. 概念浮现（10 min）</h2>
      <p>[教师组织学生表达并抽象成概念]</p>
      <h2>4. 验证与反例（10 min）</h2>
      <p>[用例题、数据或反例检验学生理解]</p>
      <h2>5. 巩固与迁移（10 min）</h2>
      <p>[设计一个新情境，要求学生独立应用]</p>
    `,
  ),
  examUnitQuiz: wrapTemplateArticle(
    "exam",
    `
      <section data-section="header">
        <p>Exam</p>
        <h1>[科目] Unit [__] Quiz</h1>
        <p><strong>时间</strong>：[__] 分钟 ｜ <strong>总分</strong>：[__] 分</p>
      </section>
      <h2>Part I: Multiple Choice（每题 2 分）</h2>
      <ol>
        <li>
          <p>[题干]</p>
          <p>(A) [选项]　(B) [选项]　(C) [选项]　(D) [选项]</p>
        </li>
        <li>
          <p>[题干]</p>
          <p>(A) [选项]　(B) [选项]　(C) [选项]　(D) [选项]</p>
        </li>
      </ol>
      <h2>Part II: Free Response（每题 5 分）</h2>
      <ol>
        <li>
          <p>[情境描述 + 问题]</p>
          <p><em>（参考答案与评分要点写在此处，发放时删除）</em></p>
        </li>
      </ol>
    `,
  ),
  examMidterm: wrapTemplateArticle(
    "exam",
    `
      <section data-section="header">
        <p>Exam</p>
        <h1>[科目] Midterm / Final Exam</h1>
        <p><strong>时间</strong>：[__] 分钟 ｜ <strong>总分</strong>：[__] 分</p>
      </section>
      <h2>Section I: Multiple Choice</h2>
      <ol>
        <li><p>[题干 + 选项]</p></li>
        <li><p>[题干 + 选项]</p></li>
        <li><p>[题干 + 选项]</p></li>
      </ol>
      <h2>Section II: Short Free Response</h2>
      <ol>
        <li><p>[简答题题干]</p></li>
        <li><p>[简答题题干]</p></li>
      </ol>
      <h2>Section III: Long Free Response / Essay</h2>
      <ol>
        <li><p>[综合题 / 长答题题干]</p></li>
      </ol>
      <p><em>教师用版可在题后保留评分点，学生版发放前删除。</em></p>
    `,
  ),
  worksheetWeeklyPractice: wrapTemplateArticle(
    "exam",
    `
      <section data-section="header">
        <p>Worksheet</p>
        <h1>Week [__] Practice — [科目]</h1>
        <p>Unit [__]：[单元名称] ｜ 预计用时 [__] 分钟</p>
      </section>
      <h2>Warm-up（复习上周）</h2>
      <ol>
        <li>[简单回顾题]</li>
      </ol>
      <h2>Core Practice（本周重点）</h2>
      <ol start="2">
        <li>[核心练习题，难度递增]</li>
        <li>[题目]</li>
        <li>[题目]</li>
      </ol>
      <h2>Challenge（拓展）</h2>
      <ol start="5">
        <li>[挑战题，选做]</li>
      </ol>
    `,
  ),
  worksheetTopicDrill: wrapTemplateArticle(
    "exam",
    `
      <section data-section="header">
        <p>Worksheet</p>
        <h1>[知识点] 专项训练</h1>
        <p>适用于单一知识点突破或作业单。</p>
      </section>
      <h2>Part A：基础巩固</h2>
      <ol>
        <li>[基础题]</li>
        <li>[基础题]</li>
      </ol>
      <h2>Part B：方法应用</h2>
      <ol start="3">
        <li>[中等题]</li>
        <li>[中等题]</li>
      </ol>
      <h2>Part C：易错点纠偏</h2>
      <ol start="5">
        <li>[错误辨析题]</li>
      </ol>
      <h2>Part D：挑战提升</h2>
      <ol start="6">
        <li>[综合题 / 拓展题]</li>
      </ol>
    `,
  ),
  notesObservation: wrapTemplateArticle(
    "notes",
    `
      <section data-section="header">
        <p>Notes</p>
        <h1>课堂观察记录</h1>
        <p><strong>日期</strong>：[____] ｜ <strong>班级</strong>：[____] ｜ <strong>课题</strong>：[____]</p>
      </section>
      <h2>教学目标达成</h2>
      <ul>
        <li>[ ] 目标 1：[描述]</li>
        <li>[ ] 目标 2：[描述]</li>
      </ul>
      <h2>学生表现</h2>
      <table>
        <thead>
          <tr><th>观察维度</th><th>记录</th></tr>
        </thead>
        <tbody>
          <tr><td>参与度</td><td>[记录]</td></tr>
          <tr><td>常见错误</td><td>[记录]</td></tr>
          <tr><td>优秀表现</td><td>[记录]</td></tr>
        </tbody>
      </table>
      <h2>改进计划</h2>
      <p>[下次课的调整方向]</p>
    `,
  ),
  notesSemesterPlan: wrapTemplateArticle(
    "notes",
    `
      <section data-section="header">
        <p>Notes</p>
        <h1>学期教学进度表</h1>
        <p>[学期名称] ｜ [科目] ｜ [年级 / 班级]</p>
      </section>
      <table>
        <thead>
          <tr>
            <th>周次</th>
            <th>教学主题</th>
            <th>核心任务</th>
            <th>测评 / 作业</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>第 1 周</td>
            <td>[填写主题]</td>
            <td>[填写核心任务]</td>
            <td>[填写测评]</td>
            <td>[填写备注]</td>
          </tr>
          <tr>
            <td>第 2 周</td>
            <td>[填写主题]</td>
            <td>[填写核心任务]</td>
            <td>[填写测评]</td>
            <td>[填写备注]</td>
          </tr>
        </tbody>
      </table>
      <h2>阶段提醒</h2>
      <ul>
        <li>[记录考试、假期、项目展示等关键节点]</li>
      </ul>
    `,
  ),
} as const;
