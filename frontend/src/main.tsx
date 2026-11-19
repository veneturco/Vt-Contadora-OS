import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/adaptive-skin-engine.css';

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMsg: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error?.message || 'Error inesperado de renderizado' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: '#0B0C0F',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            fontFamily: 'system-ui, sans-serif'
          }}
        >
          <div
            style={{
              maxWidth: '460px',
              background: '#16181F',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '16px',
              padding: '24px'
            }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: '18px' }}>VT Fiscal OS · Recuperación Segura</h2>
            <p style={{ margin: '0 0 16px', fontSize: '13px', opacity: 0.8 }}>
              Se detectó un fallo de interfaz y se activó el modo de recuperación: {this.state.errorMsg}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                border: 'none',
                background: '#0A84FF',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Recargar Aplicación
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);

if (typeof window !== 'undefined' && typeof (window as unknown as { __vtDismissSplash?: () => void }).__vtDismissSplash === 'function') {
  (window as unknown as { __vtDismissSplash: () => void }).__vtDismissSplash();
}
