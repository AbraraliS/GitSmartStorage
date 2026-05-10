import { NextRequest, NextResponse } from "next/server";
import { logger } from "./logger";

export type ApiHandler = (req: NextRequest, ...args: any[]) => Promise<NextResponse> | NextResponse;

/**
 * Standardized error handler for API routes
 */
export function withErrorHandler(handler: ApiHandler): ApiHandler {
  return async (req: NextRequest, ...args: any[]) => {
    try {
      return await handler(req, ...args);
    } catch (err: any) {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      
      logger.error(`[API Error] ${req.nextUrl.pathname}:`, {
        message,
        status,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      });

      return NextResponse.json(
        { 
          error: message,
          status,
          path: req.nextUrl.pathname 
        },
        { status: typeof status === "number" && status >= 400 && status < 600 ? status : 500 }
      );
    }
  };
}
