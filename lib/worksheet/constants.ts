import type { WorksheetLayoutConfig } from "@/types/worksheet";

export const DEFAULT_WORKSHEET_LAYOUT_CONFIG: WorksheetLayoutConfig = {
  columns: 1,
  showHeaderFooter: true,
  headerText: "",
  footerText: "",
  teacherName: "",
  schoolLogoUrl: null,
  answerSpaceSize: "medium",
  includeAnswerKey: false,
  pageSize: "Letter",
};
