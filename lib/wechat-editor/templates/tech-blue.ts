import { createTemplate } from "@/lib/wechat-editor/templates/types";

export const techBlueTemplate = createTemplate({
  id: "tech-blue",
  name: "科技蓝",
  thumbnail: "https://dummyimage.com/240x320/e0ecff/1d4ed8&text=Tech+Blue",
  categories: ["STEM", "竞赛", "科技"],
  colorFamily: "blue",
  hasHeroImage: true,
  colorScheme: {
    primary: "#1d4ed8",
    secondary: "#93c5fd",
    background: "#eff6ff",
    text: "#1e3a8a",
    accent: "#2563eb",
  },
});
