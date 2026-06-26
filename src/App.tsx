import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import BottomNav from './components/BottomNav';

import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import NewMatchPage from './pages/NewMatchPage';
import MatchRoomPage from './pages/MatchRoomPage';
import SpectatorPage from './pages/SpectatorPage';
import HistoryPage from './pages/HistoryPage';
import LeaderboardPage from './pages/LeaderboardPage';
import ProfilePage from './pages/ProfilePage';

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-900 flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  return currentUser ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-900 flex items-center justify-center text-white">
        <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Pages where BottomNav should NOT appear
  const hideNavOn = ['/match/', '/spectate/'];
  const shouldHideNav = hideNavOn.some(path => location.pathname.startsWith(path));

  return (
    <div className="min-h-screen bg-charcoal-900">
      <Routes>
        {/* Public */}
        <Route path="/spectate/:roomCode" element={<SpectatorPage />} />
        <Route
          path="/login"
          element={!currentUser ? <LoginPage /> : <Navigate to="/" replace />}
        />

        {/* Protected */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/new-match"
          element={
            <ProtectedRoute>
              <NewMatchPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/match/:roomCode"
          element={
            <ProtectedRoute>
              <MatchRoomPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <HistoryPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/leaderboard"
          element={
            <ProtectedRoute>
              <LeaderboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />

        {/* Catch-all */}
        <Route
          path="*"
          element={<Navigate to={currentUser ? "/" : "/login"} replace />}
        />
      </Routes>

      {/* Bottom navigation */}
      {currentUser && !shouldHideNav && <BottomNav />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
