export type ThemeName = "default" | "grace" | "simple";

export interface EditorConfig {
  theme: ThemeName;
  fontFamily: string;
  fontSize: string;
  primaryColor: string;
  codeBlockTheme: string;
  isCiteStatus: boolean;
  isCountStatus: boolean;
  isMacCodeBlock: boolean;
  isShowLineNumber: boolean;
  isUseIndent: boolean;
  isUseJustify: boolean;
}

export interface RenderOptions {
  citeStatus?: boolean;
  legend?: string;
  countStatus?: boolean;
  isMacCodeBlock?: boolean;
  isShowLineNumber?: boolean;
}

export interface RenderResult {
  html: string;
  readingTime?: {
    minutes: number;
    words: number;
  };
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type EditorStep = "landing" | "outline-solid" | "template" | "workspace";
export type ImportMode = "smart" | "ai" | "generate";

export type OutlineBlockType =
  | "article-title"
  | "hero-title"
  | "hero-subtitle"
  | "intro"
  | "section-title"
  | "section-content"
  | "image-placeholder"
  | "divider"
  | "blockquote";

export interface OutlineBlock {
  id: string;
  type: OutlineBlockType;
  content: string;
  editable: boolean;
  imageUrl?: string;
  styleId?: string;
}

export interface ArticleOutline {
  title: string;
  blocks: OutlineBlock[];
  keywords: string[];
}

export interface LandingState {
  mode: ImportMode;
  docxFile: File | null;
  textInput: string;
  images: File[];
  tone: string;
  paragraphCount: number;
}

export interface OutlineGenerationRequest {
  mode: ImportMode;
  text?: string;
  tone?: string;
  paragraphCount?: number;
}

export interface OutlineGenerationResponse {
  outline: ArticleOutline;
}

export type TemplateBlockType =
  | "article-title"
  | "hero-title"
  | "hero-subtitle"
  | "intro"
  | "section-title"
  | "section-content"
  | "image"
  | "divider"
  | "blockquote";

export interface TemplateBlockStyle {
  id: string;
  blockType: TemplateBlockType;
  name: string;
  previewHtml: string;
  templateHtml: string;
}

export interface Template {
  id: string;
  name: string;
  thumbnail: string;
  categories: string[];
  colorScheme: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    accent: string;
  };
  colorFamily:
    | "red"
    | "orange"
    | "yellow"
    | "green"
    | "blue"
    | "purple"
    | "pink"
    | "gray"
    | "black"
    | "white";
  hasHeroImage: boolean;
  blockStyles: TemplateBlockStyle[];
}

export interface ColorPalette {
  id: string;
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    onPrimary: string;
    lightBg: string;
    border: string;
  };
  preview: string;
}

export interface GlobalFormatSection {
  fontFamily: string;
  fontSize: number;
  color: string;
  lineHeight: number;
  letterSpacing: number;
  marginTop: number;
  marginBottom: number;
  paddingX: number;
  textAlign: "left" | "center" | "right" | "justify";
}

export interface GlobalFormat {
  heading: GlobalFormatSection;
  body: GlobalFormatSection;
  image: {
    borderRadius: number;
    margin: number;
    alignment: "left" | "center" | "right";
    shadow: boolean;
  };
  background: {
    color: string;
    paddingX: number;
    paddingY: number;
  };
}

export const DEFAULT_EDITOR_CONFIG: EditorConfig = {
  theme: "default",
  fontFamily: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: "16px",
  primaryColor: "#FF5B5B",
  codeBlockTheme: "atom-one-light",
  isCiteStatus: true,
  isCountStatus: true,
  isMacCodeBlock: false,
  isShowLineNumber: false,
  isUseIndent: false,
  isUseJustify: false,
};

export const DEFAULT_LANDING_STATE: LandingState = {
  mode: "smart",
  docxFile: null,
  textInput: "",
  images: [],
  tone: "常规",
  paragraphCount: 6,
};

export const DEFAULT_GLOBAL_FORMAT: GlobalFormat = {
  heading: {
    fontFamily: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: 28,
    color: "#1f2937",
    lineHeight: 1.6,
    letterSpacing: 1.5,
    marginTop: 0,
    marginBottom: 12,
    paddingX: 0,
    textAlign: "left",
  },
  body: {
    fontFamily: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: 16,
    color: "#374151",
    lineHeight: 1.75,
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 8,
    paddingX: 0,
    textAlign: "justify",
  },
  image: {
    borderRadius: 8,
    margin: 16,
    alignment: "center",
    shadow: false,
  },
  background: {
    color: "#ffffff",
    paddingX: 16,
    paddingY: 20,
  },
};
