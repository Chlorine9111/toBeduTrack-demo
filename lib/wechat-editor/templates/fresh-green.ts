import { createTemplate } from "@/lib/wechat-editor/templates/types";

export const freshGreenTemplate = createTemplate({
  id: "fresh-green",
  name: "清新绿",
  thumbnail: "https://dummyimage.com/240x320/e7f9ef/1f8b4c&text=Fresh+Green",
  categories: ["校园", "动态", "环保"],
  colorFamily: "green",
  hasHeroImage: true,
  colorScheme: {
    primary: "#16a34a",
    secondary: "#86efac",
    background: "#f0fdf4",
    text: "#14532d",
    accent: "#22c55e",
  },
});
