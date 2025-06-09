// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';           // ou o caminho para o seu componente raiz
import './index.css';             // se estiver usando Tailwind

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
