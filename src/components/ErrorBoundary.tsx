import { Component, ErrorInfo, ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; msg?: string };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(err: unknown) {
    return { hasError: true, msg: err instanceof Error ? err.message : String(err) };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-sm">
          <h1 className="text-xl mb-2">Etwas ist schiefgelaufen.</h1>
          <p className="opacity-80">Reload der Seite hilft oft. Details siehe Console.</p>
          <pre className="mt-3 p-3 rounded bg-black/10 overflow-auto">{this.state.msg}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
