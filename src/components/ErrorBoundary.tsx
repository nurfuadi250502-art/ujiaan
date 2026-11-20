import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Terjadi kesalahan pada aplikasi.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              Terjadi Gangguan Sistem
            </h2>
            <p className="text-sm text-slate-600">
              Aplikasi mendeteksi kesalahan tak terduga. Data lokal Anda tetap aman.
            </p>
            <pre className="text-xs font-mono bg-slate-100 border border-slate-200 rounded-lg p-3 overflow-auto max-h-40 text-rose-700">
              {this.state.errorMessage}
            </pre>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorMessage: '' })}
              className="px-4 py-2 text-sm font-medium bg-[#0F1E3D] text-white rounded-lg hover:bg-[#172B4D] transition-colors"
            >
              Muat Ulang Tampilan
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
