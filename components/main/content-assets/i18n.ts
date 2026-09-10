"use client";

import type { AssetCategory, ContentFolder } from "@/lib/content-assets/types";

export function getContentFolderLabel(
  folder: Pick<ContentFolder, "isSystem" | "slug" | "name">,
  isZh: boolean,
) {
  if (!folder.isSystem) return folder.name;

  switch (folder.slug) {
    case "my-uploads":
      return isZh ? "我的上传" : "My Uploads";
    case "recent-generated":
      return isZh ? "最近生成" : "Recent Generations";
    default:
      return folder.name;
  }
}

export function getContentCategoryLabel(category: AssetCategory, isZh: boolean) {
  switch (category) {
    case "instructional":
      return isZh ? "教学" : "Instructional";
    case "assessment":
      return isZh ? "评估" : "Assessment";
    case "student_work":
      return isZh ? "学生" : "Student Work";
    case "reference":
      return isZh ? "参考" : "Reference";
    case "uncategorized":
      return isZh ? "未归类" : "Uncategorized";
    default:
      return category;
  }
}
