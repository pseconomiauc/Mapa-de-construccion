import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error no controlado capturado por ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontFamily: 'Georgia, serif', color: '#b32424', borderBottom: '1px solid #a2a9b1', paddingBottom: '8px' }}>
            Ocurrió un error al cargar la aplicación
          </h1>
          <div style={{ background: '#ffebe9', border: '1px solid #ff8182', padding: '14px', marginTop: '16px', borderRadius: '2px' }}>
            <b>Detalle técnico:</b>
            <pre style={{ marginTop: '8px', whiteSpace: 'pre-wrap', fontSize: '13px' }}>
              {this.state.error?.toString()}
            </pre>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: '16px',
              padding: '6px 14px',
              background: '#3366cc',
              color: '#fff',
              border: 'none',
              borderRadius: '2px',
              cursor: 'pointer'
            }}
          >
            Recargar página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
