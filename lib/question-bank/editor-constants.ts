export const QUESTION_EDITOR_EXERCISE_TYPE_OPTIONS = [
  { value: "all", label: "全部题型" },
  { value: "MC", label: "选择题" },
  { value: "fill_in", label: "填空题" },
  { value: "FR", label: "解答题" },
  { value: "TF", label: "判断题" },
  { value: "experiment", label: "实验题" },
  { value: "proof", label: "证明题" },
  { value: "drawing", label: "作图题" },
] as const;

export const QUESTION_EDITOR_LOW_CONFIDENCE_THRESHOLD = 72;
