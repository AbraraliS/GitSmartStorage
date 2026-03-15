"use client";

export function setParam(pathname: string, search: URLSearchParams, key: string, value?: string): string {
  const next = new URLSearchParams(search.toString());
  if (!value) next.delete(key);
  else next.set(key, value);
  return `${pathname}?${next.toString()}`;
}
