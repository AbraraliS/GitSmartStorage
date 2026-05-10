"use client";

import React, { Component, type ReactNode } from "react";
import { AlertTriangleIcon, DownloadIcon, RefreshCwIcon } from "lucide-react";

interface Props {
  children: ReactNode;
  fileName?: string;
  downloadUrl?: string;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * SafePreviewBoundary
 *
 * React error boundary wrapping all preview renderers.
 * Catches render crashes and shows a clean fallback instead of
 * white-screening. Extension-injected errors are caught here too.
 */
export class SafePreviewBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: unknown): State {
    const msg =
      error instanceof Error ? error.message : "Renderer crashed unexpectedly";
    return { hasError: true, errorMessage: msg };
  }

  override componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Log to console for debugging — never rethrows
    console.warn("[PreviewBoundary] caught renderer error:", error, info);
  }

  reset = () => {
    this.setState({ hasError: false, errorMessage: "" });
    this.props.onRetry?.();
  };

  override render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-red-900/30 bg-gray-900 px-8 py-10 text-center">
        <div className="rounded-full bg-red-950/40 p-4">
          <AlertTriangleIcon className="h-8 w-8 text-red-400" />
        </div>
        <div>
          <p className="font-semibold text-red-300">Preview renderer crashed</p>
          <p className="mt-1 text-xs text-gray-500 break-words">
            {this.state.errorMessage}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={this.reset}
            className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 transition"
          >
            <RefreshCwIcon className="h-4 w-4" />
            Retry
          </button>
          {this.props.downloadUrl && (
            <a
              href={this.props.downloadUrl}
              download={this.props.fileName}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 transition"
            >
              <DownloadIcon className="h-4 w-4" />
              Download
            </a>
          )}
        </div>
      </div>
    );
  }
}
