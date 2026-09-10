import { createTemplate } from "@/lib/wechat-editor/templates/types";

export const chinaRedTemplate = createTemplate({
  id: "china-red",
  name: "中国红",
  thumbnail: "https://dummyimage.com/240x320/ffe5e5/b91c1c&text=China+Red",
  categories: ["节日", "政务", "通知"],
  colorFamily: "red",
  hasHeroImage: true,
  colorScheme: {
    primary: "#dc2626",
    secondary: "#fca5a5",
    background: "#fff1f2",
    text: "#7f1d1d",
    accent: "#b91c1c",
  },
});
