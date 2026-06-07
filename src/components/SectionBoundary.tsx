"use client";

import { Component, type ReactNode } from "react";

/**
 * Per-section error boundary (§6.4): a failing chart/section renders a small
 * fallback without unmounting the rest of the dashboard.
 */
export class SectionBoundary extends Component<
  { children: ReactNode; label?: string },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; label?: string }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="surge-card text-sm">
          <p className="muted">⚠️ Couldn’t load {this.props.label || "this section"}.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
