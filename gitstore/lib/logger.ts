/**
 * lib/logger.ts
 * Production-safe logger that suppresses debug output in production
 * and prevents accidental exposure of sensitive tokens.
 */

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Mask sensitive tokens in strings
 */
function maskTokens(message: string): string {
  // Regex to find things that look like GitHub tokens or Auth secrets
  // Masking ghp_ tokens and long base64/hex strings
  return message
    .replace(/ghp_[a-zA-Z0-9]{36}/g, "ghp_****")
    .replace(/gho_[a-zA-Z0-9]{36}/g, "gho_****")
    // Simple heuristic for long hex/base64 secrets (32+ chars)
    .replace(/[a-fA-F0-9]{32,}/g, (match) => match.slice(0, 4) + "....");
}

function formatArgs(args: any[]): any[] {
  return args.map((arg) => {
    if (typeof arg === "string") return maskTokens(arg);
    if (typeof arg === "object" && arg !== null) {
      try {
        return JSON.parse(maskTokens(JSON.stringify(arg)));
      } catch {
        return arg;
      }
    }
    return arg;
  });
}

export const logger = {
  debug: (...args: any[]) => {
    if (!IS_PROD) {
      console.debug("[DEBUG]", ...formatArgs(args));
    }
  },
  info: (...args: any[]) => {
    console.info("[INFO]", ...formatArgs(args));
  },
  warn: (...args: any[]) => {
    console.warn("[WARN]", ...formatArgs(args));
  },
  error: (...args: any[]) => {
    console.error("[ERROR]", ...formatArgs(args));
  },
};
