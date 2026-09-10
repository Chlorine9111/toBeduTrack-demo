export type GlobalSearchResultType =
  | "content_library_item"
  | "question"
  | "lesson_plan"
  | "pbl_project"
  | "conversation";

export type GlobalSearchMatchSource = "bootstrap" | "text";

export type GlobalSearchItem = {
  id: string;
  type: GlobalSearchResultType;
  title: string;
  subtitle: string;
  route: string;
  updatedAt: string;
  keywords: string[];
  matchSource: GlobalSearchMatchSource;
};

export type GlobalSearchBootstrapResponse = {
  items: GlobalSearchItem[];
  generatedAt: string;
};

export type GlobalSearchResponse = {
  query: string;
  items: GlobalSearchItem[];
  total: number;
};
