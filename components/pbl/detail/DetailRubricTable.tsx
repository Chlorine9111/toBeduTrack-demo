import type { PblRubricItem } from "@/lib/pbl/types";

const DIMENSION_LABELS: Record<PblRubricItem["dimension"], string> = {
  contextualize: "Contextualize",
  method: "Method Design",
  evidence: "Evidence Use",
  analysis: "Analysis",
  argument: "Argument",
  reflection: "Reflection",
};

type DetailRubricTableProps = {
  items: PblRubricItem[];
};

export function DetailRubricTable({ items }: DetailRubricTableProps) {
  if (items.length === 0) return null;

  return (
    <section className="mb-12">
      {/* 标题行 */}
      <div className="mb-8 flex items-baseline justify-between">
        <h3 className="text-2xl font-semibold tracking-tight text-[#1D1D1F]">
          Assessment Rubric
        </h3>
      </div>

      {/* 表格容器 */}
      <div className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.06)] bg-white shadow-[0px_4px_20px_rgba(0,0,0,0.03)]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-[#1D1D1F] text-white">
              <th className="p-5 text-[10px] font-bold uppercase tracking-widest">
                Criteria
              </th>
              <th className="p-5 text-[10px] font-bold uppercase tracking-widest">
                Exemplary (5)
              </th>
              <th className="p-5 text-[10px] font-bold uppercase tracking-widest">
                Proficient (4)
              </th>
              <th className="p-5 text-[10px] font-bold uppercase tracking-widest">
                Developing (3)
              </th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {items.map((item, idx) => (
              <tr
                key={item.dimension}
                className={`border-b border-[rgba(0,0,0,0.04)] ${
                  idx % 2 === 1 ? "bg-[rgba(55,53,47,0.02)]" : ""
                }`}
              >
                <td className="w-32 bg-[#F7F7F7] p-5 font-semibold text-[#1D1D1F]">
                  {DIMENSION_LABELS[item.dimension]}
                </td>
                <td className="p-5 text-[rgba(55,53,47,0.7)]">
                  {item.score5}
                </td>
                <td className="p-5 text-[rgba(55,53,47,0.7)]">
                  {item.score4}
                </td>
                <td className="p-5 text-[rgba(55,53,47,0.7)]">
                  {item.score3}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
