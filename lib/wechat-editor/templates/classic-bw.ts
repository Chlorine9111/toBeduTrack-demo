import { createTemplate } from "@/lib/wechat-editor/templates/types";

export const classicBwTemplate = createTemplate({
  id: "classic-bw",
  name: "经典黑白",
  thumbnail: "https://dummyimage.com/240x320/f5f5f5/222222&text=Classic+BW",
  categories: ["通知", "新闻", "商务"],
  colorFamily: "gray",
  hasHeroImage: false,
  colorScheme: {
    primary: "#111827",
    secondary: "#6b7280",
    background: "#ffffff",
    text: "#111827",
    accent: "#374151",
  },
});
