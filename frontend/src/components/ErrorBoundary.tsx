import React from 'react';
import { translateStatic } from '../i18n';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  title?: string;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('UI error boundary caught an error', error, info);
  }

  private reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="mx-auto my-6 w-full max-w-xl rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-slate-200">
        <h2 className="text-sm font-bold text-red-300">
          {this.props.title || translateStatic('unexpectedUiError')}
        </h2>
        <p className="mt-2 text-xs text-slate-400">
          {translateStatic('sectionLoadFailed')}
        </p>
        {this.state.error?.message && (
          <p className="mt-2 break-words rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-[11px] text-slate-400">
            {this.state.error.message}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={this.reset}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-neutral-800"
          >
            {translateStatic('retryAction')}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-skyBlue px-3 py-2 text-xs font-bold text-black transition-colors hover:bg-skyBlue-hover"
          >
            {translateStatic('reloadPage')}
          </button>
        </div>
      </div>
    );
  }
}
