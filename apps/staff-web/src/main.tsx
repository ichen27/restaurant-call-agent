import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { DemoApp } from './demo/DemoApp';
import './demo/demo.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith('/staff') ? <App /> : <DemoApp />}
  </React.StrictMode>
);
