"use client";

import type { ReactNode } from "react";

/** A4 纵向比例 297mm / 210mm */
const A4_RATIO = 297 / 210;

export { A4_RATIO };

export default function PageContainer({
  pageNumber,
  totalPages,
  width,
  children,
  isFirstPage,
  title,
}: {
  pageNumber: number;
  totalPages: number;
  width: number;
  children: ReactNode;
  isFirstPage?: boolean;
  title?: string;
}) {
  const height = width * A4_RATIO;
  const paddingX = width * (20 / 210);
  const paddingY = height * (22 / 297);

  return (
    <div
      className="relative mx-auto bg-white shadow-[0_1px_8px_rgba(0,0,0,0.08)]"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        padding: `${paddingY}px ${paddingX}px`,
      }}
    >
      {/* 第一页的标题区域 */}
      {isFirstPage && title ? (
        <div className="mb-4 text-center">
          <h1 className="text-lg font-bold text-[#37352F]">{title}</h1>
        </div>
      ) : null}

      {/* 题目内容区域 - 使用 overflow-hidden 防止溢出 */}
      <div className="relative overflow-hidden" style={{ height: `calc(100% - 24px)` }}>
        {children}
      </div>

      {/* 页脚 */}
      <div className="absolute bottom-3 left-0 right-0 flex justify-between px-8 text-[7px] text-[#999]">
        <span>deskmate.pro</span>
        <span>
          {pageNumber} / {totalPages}
        </span>
        <span>Deskmate</span>
      </div>
    </div>
  );
}
