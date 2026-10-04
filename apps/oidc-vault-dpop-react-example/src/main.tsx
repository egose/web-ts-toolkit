import { createRoot } from 'react-dom/client';

import App from './App';

// No StrictMode here: the one-time callback code exchange must run exactly once,
// and StrictMode double-invokes effects in development.
const mount = document.querySelector('#root');
if (!mount) throw new Error('Missing #root element.');

createRoot(mount).render(<App />);
