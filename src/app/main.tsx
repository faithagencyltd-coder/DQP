import { createRoot } from 'react-dom/client';
import { App } from './App';
import './ds/tokens.css';
import { StoreProvider } from './stores/app-store';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StoreProvider>
    <App />
  </StoreProvider>,
);
