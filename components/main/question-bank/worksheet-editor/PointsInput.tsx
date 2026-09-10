"use client";

export default function PointsInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-xl border border-[rgba(55,53,47,0.1)] bg-white px-3 py-2 text-sm text-[#37352F]/70">
      分值
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) =>
          onChange(Math.max(0, Math.min(100, Number(event.target.value) || 0)))
        }
        className="w-14 bg-transparent text-right text-sm text-[#37352F] outline-none"
      />
    </label>
  );
}
