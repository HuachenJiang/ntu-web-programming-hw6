type LogLevel = "info" | "warn" | "error";

export type LogFields = {
  event: string;
  updateId?: number;
  route?: string;
  chatId?: number | null;
  errorCode?: string;
  [key: string]: string | number | boolean | null | undefined;
};

export type Logger = {
  info(fields: LogFields): void;
  warn(fields: LogFields): void;
  error(fields: LogFields): void;
};

function writeLog(level: LogLevel, fields: LogFields): void {
  const payload = {
    level,
    timestamp: new Date().toISOString(),
    ...fields,
  };

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  console.info(payload);
}

export const logger: Logger = {
  info(fields) {
    writeLog("info", fields);
  },
  warn(fields) {
    writeLog("warn", fields);
  },
  error(fields) {
    writeLog("error", fields);
  },
};
