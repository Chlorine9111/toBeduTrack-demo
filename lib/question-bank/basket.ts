export const QUESTION_BASKET_STORAGE_KEY = "question-bank:worksheet-basket";
export const QUESTION_BASKET_UPDATED_EVENT = "question-bank-basket-updated";

export type QuestionBasketItem = {
  id: string;
  questionText: string;
  exerciseType:
    | "MC"
    | "FR"
    | "fill_in"
    | "TF"
    | "experiment"
    | "proof"
    | "drawing";
  difficulty: number;
  options: Array<{ label: string; text: string; isCorrect?: boolean; imageUrl?: string | null }> | null;
  correctAnswer?: string | null;
  solutionSteps?: string | null;
  stage?: string | null;
  subject?: string | null;
  gradeLevel?: string | null;
  textbookVersion?: string | null;
  knowledgePoints?: string[];
  sourceKind?: string | null;
  isAiGenerated?: boolean;
  createdAt?: string | null;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function dispatchBasketUpdated() {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(QUESTION_BASKET_UPDATED_EVENT));
}

export function readQuestionBasket(): QuestionBasketItem[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(QUESTION_BASKET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QuestionBasketItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeQuestionBasket(items: QuestionBasketItem[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(
    QUESTION_BASKET_STORAGE_KEY,
    JSON.stringify(items),
  );
  dispatchBasketUpdated();
}

export function upsertQuestionBasketItems(items: QuestionBasketItem[]) {
  const current = readQuestionBasket();
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of items) {
    map.set(item.id, item);
  }
  writeQuestionBasket(Array.from(map.values()));
}

export function removeQuestionBasketItem(id: string) {
  const current = readQuestionBasket().filter((item) => item.id !== id);
  writeQuestionBasket(current);
}

export function clearQuestionBasket() {
  writeQuestionBasket([]);
}
