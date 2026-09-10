import type { PblRubricItem } from "@/lib/pbl/types";

const DIMENSION_LABELS: Record<PblRubricItem["dimension"], string> = {
  contextualize: "情境理解",
  method: "方法设计",
  evidence: "证据使用",
  analysis: "分析解释",
  argument: "论证表达",
  reflection: "反思迁移",
};

type RubricTableProps = {
  items: PblRubricItem[];
};

export function RubricTable({ items }: RubricTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="bg-slate-950 text-white">
          <tr>
            <th className="px-4 py-3 font-medium">维度</th>
            <th className="px-4 py-3 font-medium">5 分</th>
            <th className="px-4 py-3 font-medium">4 分</th>
            <th className="px-4 py-3 font-medium">3 分</th>
            <th className="px-4 py-3 font-medium">2 分</th>
            <th className="px-4 py-3 font-medium">1 分</th>
            <th className="px-4 py-3 font-medium">学生版描述</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.dimension} className="align-top odd:bg-white even:bg-slate-50">
              <th className="border-t border-slate-200 px-4 py-4 font-semibold text-slate-900">
                {DIMENSION_LABELS[item.dimension]}
              </th>
              <td className="border-t border-slate-200 px-4 py-4 leading-6 text-slate-700">{item.score5}</td>
              <td className="border-t border-slate-200 px-4 py-4 leading-6 text-slate-700">{item.score4}</td>
              <td className="border-t border-slate-200 px-4 py-4 leading-6 text-slate-700">{item.score3}</td>
              <td className="border-t border-slate-200 px-4 py-4 leading-6 text-slate-700">{item.score2}</td>
              <td className="border-t border-slate-200 px-4 py-4 leading-6 text-slate-700">{item.score1}</td>
              <td className="border-t border-slate-200 px-4 py-4 leading-6 text-slate-700">
                {item.studentVersion}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
