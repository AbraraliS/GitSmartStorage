/**
 * lib/utils.ts
 * Shared utility functions.
 */

/** Joins class names, filtering falsy values. Replaces clsx/classnames for zero-dep usage. */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
