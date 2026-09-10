import { createTemplate } from "@/lib/wechat-editor/templates/types";

export const natureBrownTemplate = createTemplate({
  id: "nature-brown",
  name: "自然棕",
  thumbnail: "https://dummyimage.com/240x320/f8f1e3/8b5a2b&text=Nature+Brown",
  categories: ["研学", "户外", "活动"],
  colorFamily: "orange",
  hasHeroImage: true,
  colorScheme: {
    primary: "#8b5a2b",
    secondary: "#d8b38c",
    background: "#fef9f3",
    text: "#4e342e",
    accent: "#a16207",
  },
});
