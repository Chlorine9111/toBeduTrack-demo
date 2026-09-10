export type ThemeName = "light" | "dark"

export type WelcomeTheme = {
  name: ThemeName
  cardBg: string
  leftBg: string
  cardBorder: string
  divider: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  accent: string
  accentSubtle: string
  pageBg: string
  shadowColor: string
  glossOpacity: number
}

export const THEMES: Record<ThemeName, WelcomeTheme> = {
  light: {
    name: "light",
    cardBg: "#FFFFFF",
    leftBg: "#F5F5F5",
    cardBorder: "rgba(0,0,0,0.08)",
    divider: "rgba(0,0,0,0.06)",
    textPrimary: "#0A0A0A",
    textSecondary: "#555555",
    textMuted: "#999999",
    accent: "#0A0A0A",
    accentSubtle: "rgba(0,0,0,0.03)",
    pageBg: "#E8E8E8",
    shadowColor: "0,0,0",
    glossOpacity: 0.06,
  },
  dark: {
    name: "dark",
    cardBg: "#0A0A0A",
    leftBg: "#111111",
    cardBorder: "rgba(255,255,255,0.08)",
    divider: "rgba(255,255,255,0.06)",
    textPrimary: "#FFFFFF",
    textSecondary: "#999999",
    textMuted: "#555555",
    accent: "#FFFFFF",
    accentSubtle: "rgba(255,255,255,0.04)",
    pageBg: "#000000",
    shadowColor: "0,0,0",
    glossOpacity: 0.04,
  },
}

export const DEFAULT_THEME: ThemeName = "light"
