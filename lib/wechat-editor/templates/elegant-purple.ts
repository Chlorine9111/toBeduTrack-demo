import { createTemplate } from "@/lib/wechat-editor/templates/types";

export const elegantPurpleTemplate = createTemplate({
  id: "elegant-purple",
  name: "高雅紫",
  thumbnail: "https://dummyimage.com/240x320/f3e8ff/6d28d9&text=Elegant+Purple",
  categories: ["颁奖", "毕业季", "活动"],
  colorFamily: "purple",
  hasHeroImage: true,
  colorScheme: {
    primary: "#7c3aed",
    secondary: "#c4b5fd",
    background: "#faf5ff",
    text: "#3b0764",
    accent: "#a855f7",
  },
});
