type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = {
  module: string;
  action: string;
  [key: string]: unknown;
};

function createLogger(module: string) {
  const log = (
    level: LogLevel,
    message: string,
    context?: Partial<LogContext>,
    error?: unknown,
  ) => {
    const entry = {
      ts: new Date().toISOString(),
      level,
      module,
      message,
      ...context,
      ...(error instanceof Error
        ? { error: error.message, stack: error.stack }
        : {}),
    };

    switch (level) {
      case "error":
        console.error(JSON.stringify(entry));
        break;
      case "warn":
        console.warn(JSON.stringify(entry));
        break;
      default:
        if (process.env.NODE_ENV === "development") {
          console.log(JSON.stringify(entry));
        }
    }
  };

  return {
    debug: (msg: string, ctx?: Partial<LogContext>) => log("debug", msg, ctx),
    info: (msg: string, ctx?: Partial<LogContext>) => log("info", msg, ctx),
    warn: (msg: string, ctx?: Partial<LogContext>, err?: unknown) =>
      log("warn", msg, ctx, err),
    error: (msg: string, ctx?: Partial<LogContext>, err?: unknown) =>
      log("error", msg, ctx, err),
  };
}

export { createLogger };
export type { LogContext };
