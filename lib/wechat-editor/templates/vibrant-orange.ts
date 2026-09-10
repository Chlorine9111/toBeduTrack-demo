import { createTemplate } from "@/lib/wechat-editor/templates/types";

export const vibrantOrangeTemplate = createTemplate({
  id: "vibrant-orange",
  name: "活力橙",
  thumbnail: "https://dummyimage.com/240x320/fff1e8/d97008&text=Vibrant+Orange",
  categories: ["活动", "动态", "校园"],
  colorFamily: "orange",
  hasHeroImage: true,
  colorScheme: {
    primary: "#f97316",
    secondary: "#fdba74",
    background: "#fff7ed",
    text: "#3f2d1f",
    accent: "#ea580c",
  },
});
