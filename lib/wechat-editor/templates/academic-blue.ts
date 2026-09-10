import { createTemplate } from "@/lib/wechat-editor/templates/types";

export const academicBlueTemplate = createTemplate({
  id: "academic-blue",
  name: "学术蓝",
  thumbnail: "https://dummyimage.com/240x320/e6f0ff/1f4ea3&text=Academic+Blue",
  categories: ["教育", "学术", "校园"],
  colorFamily: "blue",
  hasHeroImage: true,
  colorScheme: {
    primary: "#1a5fb4",
    secondary: "#4f8dd8",
    background: "#ffffff",
    text: "#1f2937",
    accent: "#1a73e8",
  },
});
