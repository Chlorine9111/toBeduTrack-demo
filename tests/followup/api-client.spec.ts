import {
  ApiError,
  getClientRequestErrorMessage,
  isFetchLikeClientError,
  toClientRequestError,
} from "../../lib/api/client";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(message);
    console.error(`  FAIL: ${message}`);
  }
}

function describe(name: string, fn: () => void | Promise<void>) {
  console.log(`\n${name}`);
  return Promise.resolve(fn());
}

async function it(name: string, fn: () => void | Promise<void>) {
  const failedBefore = failed;
  try {
    await fn();
    if (failed === failedBefore) {
      console.log(`  PASS: ${name}`);
    }
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.error(`  FAIL: ${name}: ${message}`);
  }
}

async function main() {
  await describe("api client error normalization", async () => {
    await it("should recognize fetch-like browser errors", async () => {
      assert(isFetchLikeClientError(new TypeError("Failed to fetch")), "expected Failed to fetch to be recognized");
      assert(isFetchLikeClientError(new Error("fetch failed")), "expected fetch failed to be recognized");
      assert(!isFetchLikeClientError(new Error("文档不存在")), "expected business error to stay non-fetch-like");
    });

    await it("should map fetch-like errors to a Chinese retry hint", async () => {
      const message = getClientRequestErrorMessage(new TypeError("Failed to fetch"));
      assert(message === "网络请求失败，请检查连接后重试", `unexpected message: ${message}`);
    });

    await it("should map AbortError to timeout message", async () => {
      const error = new DOMException("The operation was aborted.", "AbortError");
      const message = getClientRequestErrorMessage(error);
      assert(message === "请求超时，请重试", `unexpected abort message: ${message}`);
    });

    await it("should preserve ApiError business messages", async () => {
      const error = new ApiError(409, "文档版本已变化，请刷新后重试");
      const message = getClientRequestErrorMessage(error);
      assert(message === "文档版本已变化，请刷新后重试", `unexpected api message: ${message}`);
    });

    await it("should preserve ApiError status when wrapping", async () => {
      const wrapped = toClientRequestError(new ApiError(404, "文档不存在"));
      assert(wrapped instanceof ApiError, "expected wrapped error to stay ApiError");
      assert((wrapped as ApiError).status === 404, `unexpected status: ${(wrapped as ApiError).status}`);
      assert(wrapped.message === "文档不存在", `unexpected wrapped message: ${wrapped.message}`);
    });
  });

  console.log(`\nPassed: ${passed}`);
  if (failed > 0) {
    console.error(`Failed: ${failed}`);
    process.exitCode = 1;
    return;
  }
  console.log("Failed: 0");
}

void main();
