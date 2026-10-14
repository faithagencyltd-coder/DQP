import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider, OrgProvider } from './lib/session';
import { ToastProvider } from './ui';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <HashRouter>
          <AuthProvider>
            <OrgProvider>
              <App />
            </OrgProvider>
          </AuthProvider>
        </HashRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
