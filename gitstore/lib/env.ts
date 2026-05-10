import { z } from "zod";

const envSchema = z.object({
  // --- Node ---
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // --- Auth ---
  GITHUB_ID: z.string().min(1, "GITHUB_ID is required"),
  GITHUB_SECRET: z.string().min(1, "GITHUB_SECRET is required"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  
  // NEXTAUTH_URL is used by Auth.js/NextAuth v4/v5.
  // In Vercel, it's often not needed if AUTH_URL is set or if using Vercel automatic detection.
  NEXTAUTH_URL: z.string().url().optional().or(z.string().length(0)).default("http://localhost:3000"),
  
  // Required for local development with Auth.js v5
  AUTH_TRUST_HOST: z.string().optional().transform((v) => v === "true" || v === "1").default("false"),

  // --- Redis ---
  REDIS_URL: z.string().min(1, "REDIS_URL is required").default("redis://localhost:6379"),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // --- CDN ---
  NEXT_PUBLIC_CDN_WORKER_URL: z.string().optional(),
});

// Validate process.env and export a type-safe object
const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid environment variables:", _env.error.format());
  // Don't crash the build if we are in a build environment (some envs might be missing during build)
  if (process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE) {
     throw new Error("Invalid environment variables");
  }
}

export const env = _env.success ? _env.data : ({} as z.infer<typeof envSchema>);

/**
 * Utility to check if we are running on Vercel
 */
export const IS_VERCEL = !!process.env.VERCEL;

/**
 * Get the base URL of the application
 */
export function getAppUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return env.NEXTAUTH_URL || "http://localhost:3000";
}
