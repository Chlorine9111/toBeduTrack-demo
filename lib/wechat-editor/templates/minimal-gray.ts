import { createTemplate } from "@/lib/wechat-editor/templates/types";

export const minimalGrayTemplate = createTemplate({
  id: "minimal-gray",
  name: "极简灰",
  thumbnail: "https://dummyimage.com/240x320/f4f4f5/52525b&text=Minimal+Gray",
  categories: ["通用", "极简", "总结回顾"],
  colorFamily: "gray",
  hasHeroImage: false,
  colorScheme: {
    primary: "#52525b",
    secondary: "#a1a1aa",
    background: "#fafafa",
    text: "#27272a",
    accent: "#71717a",
  },
});
