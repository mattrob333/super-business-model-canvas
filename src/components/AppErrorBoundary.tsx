import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Last line of defense: without a boundary, any uncaught render error unmounts
 * the entire tree and the user gets a silent black page (owner bug 2026-07-06:
 * navigating into a workspace after a deploy "opens up just a black screen").
 * This renders an honest recovery screen instead — plain inline styles so it
 * works even if the CSS pipeline itself is what broke.
 */
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "24px",
          background: "#16181d",
          color: "#e7e9ee",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "18px", fontWeight: 600 }}>Something went wrong on this page</div>
        <div style={{ fontSize: "14px", color: "#9aa1ad", maxWidth: "420px" }}>
          This usually happens when a new version of the app was deployed while this tab
          was open. Reloading picks up the latest version.
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: "8px",
            padding: "10px 20px",
            borderRadius: "8px",
            border: "none",
            background: "#f0821c",
            color: "#1a130b",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reload the app
        </button>
        <code style={{ marginTop: "16px", fontSize: "11px", color: "#6b7280", maxWidth: "480px", overflowWrap: "anywhere" }}>
          {this.state.error.message}
        </code>
      </div>
    );
  }
}
