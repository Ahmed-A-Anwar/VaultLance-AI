export const logger = {
  info: (message: string, meta?: unknown) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, meta ? JSON.stringify(meta) : "");
  },
  warn: (message: string, meta?: unknown) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, meta ? JSON.stringify(meta) : "");
  },
  error: (message: string, err?: unknown) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, err || "");
  },
  debug: (message: string, meta?: unknown) => {
    if (process.env.DEBUG || process.env.NODE_ENV === "development") {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, meta ? JSON.stringify(meta) : "");
    }
  },
};
