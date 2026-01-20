import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary component to catch JavaScript errors anywhere in their child component tree,
 * log those errors, and display a fallback UI instead of the component tree that crashed.
 */
class ErrorBoundary extends Component<Props, State> {
  // Use class field for state to ensure TypeScript correctly recognizes it as a member of the class
  public state: State = {
    hasError: false,
    error: null,
  };

  constructor(props: Props) {
    super(props);
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render(): ReactNode {
    // Accessing state and props via 'this' which are inherited from Component<Props, State>
    const { hasError, error } = this.state;
    const { children } = this.props;

    if (hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-scale-in">
                <div className="bg-rose-50 p-6 border-b border-rose-100 flex items-center gap-4">
                    <div className="p-3 bg-white rounded-xl text-rose-500 shadow-sm border border-rose-100">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Application Error</h2>
                        <p className="text-xs font-bold text-rose-500 uppercase tracking-wider mt-1">System Crash</p>
                    </div>
                </div>
                
                <div className="p-6">
                    <p className="text-slate-600 text-sm mb-4">
                        The application encountered an unexpected error and needs to restart.
                    </p>
                    
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 overflow-auto max-h-48 custom-scrollbar">
                        <code className="text-xs font-mono text-slate-700 break-words block">
                            {error?.toString() || "Unknown Error"}
                        </code>
                    </div>

                    <button 
                        onClick={() => window.location.reload()} 
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-slate-500/20 transform transition-all active:scale-95 hover:-translate-y-0.5 flex items-center justify-center gap-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Reload Application
                    </button>
                </div>
            </div>
        </div>
      );
    }

    return children || null;
  }
}

export default ErrorBoundary;