/**
 * 从结构化数据直接生成学术风格 HTML。
 * 不依赖 LLM，确保 Canvas 总有内容渲染。
 */

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Rubric ───

export type RubricHtmlDimension = {
  name: string;
  weight?: number | null;
  levels: Array<{ label: string; score: number; description: string }>;
};

export function buildRubricHtml(params: {
  title: string;
  subtitle?: string;
  dimensions: RubricHtmlDimension[];
}): string {
  const { title, subtitle, dimensions } = params;
  if (dimensions.length === 0) return "";

  const levelLabels = dimensions[0].levels.map(
    (l) => `${esc(l.label)} (${l.score})`,
  );

  const headerRow = [
    "<th>Criteria</th>",
    "<th>Weight</th>",
    ...levelLabels.map((l) => `<th>${l}</th>`),
  ].join("");

  const bodyRows = dimensions
    .map((d) => {
      const cells = [
        `<td><strong>${esc(d.name)}</strong></td>`,
        `<td>${d.weight != null ? `${d.weight}%` : "—"}</td>`,
        ...d.levels.map((l) => `<td>${esc(l.description)}</td>`),
      ];
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("\n");

  return `<article data-doc-type="rubric">
<section data-section="header">
<h1>${esc(title)}</h1>
${subtitle ? `<p>${esc(subtitle)}</p>` : ""}
</section>
<section data-section="rubric-matrix">
<table data-rubric>
<thead><tr>${headerRow}</tr></thead>
<tbody>
${bodyRows}
</tbody>
</table>
</section>
</article>`;
}

// ─── Exercises ───

export type ExerciseHtmlItem = {
  number: number;
  points: number;
  type: string;
  questionText: string;
  options?: Array<{ label: string; text: string }>;
  correctAnswer?: string;
  explanation?: string;
};

export function buildExercisesHtml(params: {
  title: string;
  subtitle?: string;
  exercises: ExerciseHtmlItem[];
}): string {
  const { title, subtitle, exercises } = params;
  if (exercises.length === 0) return "";

  const mcExercises = exercises.filter((e) => e.type === "MC");
  const frExercises = exercises.filter((e) => e.type !== "MC");

  function renderQuestion(ex: ExerciseHtmlItem): string {
    const lines = [
      `<div data-question="${ex.number}" data-points="${ex.points}">`,
      `<p><strong>${ex.number}.</strong> (${ex.points} pts) ${esc(ex.questionText)}</p>`,
    ];
    if (ex.options && ex.options.length > 0) {
      lines.push(`<ol data-options type="A">`);
      for (const opt of ex.options) {
        lines.push(`<li>${esc(opt.text)}</li>`);
      }
      lines.push("</ol>");
    } else {
      lines.push(`<div data-answer-space="medium"></div>`);
    }
    lines.push("</div>");
    return lines.join("\n");
  }

  const sections: string[] = [];

  if (mcExercises.length > 0) {
    const totalPts = mcExercises.reduce((s, e) => s + e.points, 0);
    sections.push(
      `<section data-section="part-mc">
<h2>Multiple Choice (${totalPts} pts)</h2>
${mcExercises.map(renderQuestion).join("\n<hr>\n")}
</section>`,
    );
  }

  if (frExercises.length > 0) {
    const totalPts = frExercises.reduce((s, e) => s + e.points, 0);
    sections.push(
      `<section data-section="part-fr">
<h2>Free Response (${totalPts} pts)</h2>
${frExercises.map(renderQuestion).join("\n<hr>\n")}
</section>`,
    );
  }

  const totalPoints = exercises.reduce((s, e) => s + e.points, 0);

  return `<article data-doc-type="exercises">
<section data-section="header">
<h1>${esc(title)}</h1>
${subtitle ? `<p>${esc(subtitle)}</p>` : ""}
<p>Name: ________________ Date: ________ Period: ____</p>
<p>Total: ${totalPoints} pts</p>
</section>
${sections.join("\n")}
</article>`;
}
