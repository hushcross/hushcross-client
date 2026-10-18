import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../../web/src/App';
import '../../web/src/styles/fonts.css';
import '../../web/src/styles/tokens.css';
import '../../web/src/styles/global.css';
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<StrictMode><App /></StrictMode>);
