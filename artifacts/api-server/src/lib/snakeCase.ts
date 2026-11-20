function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, (m) => `_${m.toLowerCase()}`);
}

function transformKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(transformKeys);
  }
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[toSnakeCase(k)] = transformKeys(v);
    }
    return out;
  }
  return value;
}

import type { Request, Response, NextFunction } from "express";

export function snakeCaseResponse(_req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown): Response {
    return originalJson(transformKeys(body));
  };
  next();
}
