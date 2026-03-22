import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './WorkspaceApp.jsx';

document.body.innerHTML = '<div id="root"></div>';
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing #root element.');
}

createRoot(rootElement).render(<App />);
