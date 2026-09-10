import { createTemplate } from "@/lib/wechat-editor/templates/types";

export const warmPinkTemplate = createTemplate({
  id: "warm-pink",
  name: "暖心粉",
  thumbnail: "https://dummyimage.com/240x320/ffe4ef/be185d&text=Warm+Pink",
  categories: ["节日", "感恩", "校园"],
  colorFamily: "pink",
  hasHeroImage: true,
  colorScheme: {
    primary: "#db2777",
    secondary: "#f9a8d4",
    background: "#fff1f6",
    text: "#831843",
    accent: "#ec4899",
  },
});
