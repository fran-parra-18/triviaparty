import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { HostPage } from './pages/host/HostPage';
import { PlayerPage } from './pages/player/PlayerPage';
import { RulesPage } from './pages/RulesPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/host" element={<HostPage />} />
        <Route path="/join" element={<PlayerPage />} />
        <Route path="/join/:code" element={<PlayerPage />} />
        <Route path="/play" element={<Navigate to="/join" replace />} />
        <Route path="/reglas" element={<RulesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
