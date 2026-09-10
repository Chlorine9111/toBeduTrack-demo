import juice from "juice/client";

function stripHtmlTags(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function mergeCss(html: string): string {
  return juice(html, {
    removeStyleTags: true,
    preserveImportant: true,
  });
}

export function modifyHtmlStructure(html: string): string {
  if (typeof window === "undefined") {
    return html;
  }

  const documentModel = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
  const root = documentModel.getElementById("root");
  if (!root) {
    return html;
  }

  const listItems = Array.from(root.querySelectorAll("li"));
  listItems.forEach((listItem) => {
    const next = listItem.nextElementSibling;
    if (!next) return;
    const tagName = next.tagName.toLowerCase();
    if (tagName === "ul" || tagName === "ol") {
      listItem.appendChild(next);
    }
  });

  return root.innerHTML;
}

export function solveWeChatImage(container: HTMLElement): void {
  container.querySelectorAll("img").forEach((image) => {
    const width = image.getAttribute("width");
    const height = image.getAttribute("height");
    const style = image.getAttribute("style") ?? "";

    const pieces = [style];
    if (!/max-width:/i.test(style)) {
      pieces.push("max-width:100%");
    }
    if (!/height:/i.test(style)) {
      pieces.push("height:auto");
    }
    if (width && !/width:/i.test(style)) {
      pieces.push(`width:${width}px`);
    }
    if (height && !/height:/i.test(style)) {
      pieces.push(`height:${height}px`);
    }

    image.setAttribute("style", pieces.filter(Boolean).join(";") + ";");
    image.removeAttribute("width");
    image.removeAttribute("height");
  });
}

export function processForWeChat(html: string, themeCSS: string, primaryColor: string): string {
  const mergedHtml = `
<style id="wechat-inline-theme">${themeCSS}</style>
<div id="wechat-output">${html}</div>
`;

  const inlined = mergeCss(mergedHtml);

  if (typeof window === "undefined") {
    return inlined;
  }

  const parsed = new DOMParser().parseFromString(inlined, "text/html");
  const output = parsed.getElementById("wechat-output");
  if (!output) {
    return inlined;
  }

  solveWeChatImage(output);
  const normalized = modifyHtmlStructure(output.innerHTML)
    .replace(/var\(--wechat-primary-color\)/g, primaryColor)
    .replace(/var\(--wechat-font-size\)/g, "16px")
    .replace(/var\(--wechat-font-family\)/g, "'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif")
    .replace(/var\(--wechat-paragraph-[^)]+\)/g, "")
    .replace(/--wechat-[a-z-]+:[^;]+;/g, "");

  return normalized;
}

export async function copyToClipboard(html: string, plainText: string): Promise<void> {
  const textContent = plainText || stripHtmlTags(html);

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    "write" in navigator.clipboard &&
    typeof ClipboardItem !== "undefined"
  ) {
    const clipboardItem = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([textContent], { type: "text/plain" }),
    });
    await navigator.clipboard.write([clipboardItem]);
    return;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(textContent);
    return;
  }

  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.value = textContent;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}
