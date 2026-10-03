import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ProjectProvider } from './store/ProjectContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ProjectProvider>
      <App />
    </ProjectProvider>
  </React.StrictMode>
);
