import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { isDemo } from './lib/config';
import { AuthProvider, OrgProvider } from './lib/session';
import { ToastProvider } from './ui';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } });

const root = createRoot(document.getElementById('root')!);

function Splash({ text, error }: { text: string; error?: boolean }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'Inter, system-ui, sans-serif', background: '#f5f7fb', padding: 24 }}>
      <div style={{ maxWidth: 460, textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#0f1f38' }}>PLANORA <span style={{ color: '#f26a1b' }}>BTP</span></div>
        <div style={{ marginTop: 6, fontSize: 13, color: '#667085' }}>Version de démonstration</div>
        <p style={{ marginTop: 18, fontSize: 15, color: error ? '#b42318' : '#1b2433', lineHeight: 1.5 }}>{text}</p>
      </div>
    </div>
  );
}

function renderApp() {
  root.render(
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
}

// Démonstration : la base embarquée est préparée avant l'affichage, et une seule fenêtre peut
// l'utiliser à la fois (deux onglets sur la même base l'abîmeraient).
async function startDemo() {
  root.render(<Splash text="Préparation de la base de démonstration… (quelques secondes au premier lancement)" />);
  const run = async () => {
    try {
      const { getDemoDb } = await import('./demo/db');
      await getDemoDb();
      renderApp();
    } catch (e) {
      root.render(<Splash error text={`La démonstration n’a pas pu démarrer : ${(e as Error).message}. Utilisez une version récente de Chrome, Edge ou Firefox.`} />);
    }
    await new Promise(() => { /* verrou conservé tant que la page est ouverte */ });
  };
  if (navigator.locks) {
    await navigator.locks.request('planora-btp-demo', { ifAvailable: true }, async (lock) => {
      if (!lock) { root.render(<Splash error text="PLANORA BTP (démonstration) est déjà ouvert dans un autre onglet ou une autre fenêtre de ce navigateur. Fermez cette page et utilisez l’autre." />); return; }
      await run();
    });
  } else await run();
}

if (isDemo) void startDemo();
else renderApp();
