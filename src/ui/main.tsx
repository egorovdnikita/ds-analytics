import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './parts/boundary';
import './index.css';

const container = document.getElementById('root');
if (container === null) throw new Error('#root not found');

createRoot(container).render(
  <StrictMode>
    {/* key сбрасывает всё дерево: после падения продолжать с прежним
        состоянием опаснее, чем начать с чистого листа. */}
    <ErrorBoundary onReset={() => window.location.reload()}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
