import { access } from "fs/promises";
import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";

const LOCAL_CHROME_CANDIDATES = [
  process.env.CHROME_EXECUTABLE_PATH?.trim() || "",
  process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || "",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter(Boolean);

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveLocalExecutablePath() {
  for (const candidate of LOCAL_CHROME_CANDIDATES) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

function isServerlessRuntime() {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.AWS_LAMBDA_FUNCTION_NAME,
  );
}

export async function resolveChromiumExecutablePath() {
  if (isServerlessRuntime()) {
    return chromium.executablePath();
  }

  return resolveLocalExecutablePath();
}

export async function launchDocumentBrowser(): Promise<Browser> {
  const executablePath = await resolveChromiumExecutablePath();
  if (!executablePath) {
    throw new Error(
      "未找到可用的 Chromium/Chrome 可执行文件。请配置 CHROME_EXECUTABLE_PATH。",
    );
  }

  return puppeteer.launch({
    executablePath,
    args: isServerlessRuntime() ? chromium.args : ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
    defaultViewport: {
      width: 1440,
      height: 2048,
      deviceScaleFactor: 1,
    },
  });
}
