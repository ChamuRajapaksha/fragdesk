import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import Button from "./Button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page render failed:", error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-frag-surface border border-frag-border rounded-xl p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-frag-danger/10 text-frag-danger">
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-lg font-semibold text-frag-text">Something went wrong</h2>
          <p className="mt-2 text-sm text-frag-muted break-words">
            This page hit an unexpected error. You can try loading it again, or restart the app.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-frag-bg border border-frag-border p-3 text-left text-xs text-frag-danger whitespace-pre-wrap">
            {error.message}
          </pre>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Reload app
            </Button>
            <Button onClick={this.handleRetry}>Try again</Button>
          </div>
        </div>
      </div>
    );
  }
}
