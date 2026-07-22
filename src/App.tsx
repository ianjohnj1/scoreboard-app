import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Zap, RotateCcw } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import BottomNav from './components/BottomNav';

import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import NewMatchPage from './pages/NewMatchPage';
import MatchRoomPage from './pages/MatchRoomPage';
import SpectatorPage from './pages/SpectatorPage';
import HistoryPage from './pages/HistoryPage';
import LeaderboardPage from './pages/LeaderboardPage';
import ProfilePage from './pages/ProfilePage';
import AboutPage from './pages/AboutPage';

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-900 flex items-center justify-center text-charcoal-50">
        Loading...
      </div>
    );
  }

  return currentUser ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { currentUser, loading, connectionError, retryConnection } = useAuth();
  const location = useLocation();

  if (connectionError) {
    return (
      <div className="min-h-screen bg-charcoal-900 flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-charcoal-800 border border-charcoal-700 rounded-2xl p-8 shadow-2xl">
          <div className="w-16 h-16 bg-danger-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Zap size={32} className="text-danger-400" />
          </div>
          <h2 className="text-charcoal-50 text-2xl font-bold mb-3">Service Unavailable</h2>
          <p className="text-charcoal-400 mb-8 leading-relaxed">
            We're having trouble connecting to the scoreboard servers. 
            Please check your internet connection and try again.
          </p>
          <button
            onClick={retryConnection}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-charcoal-50 font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <RotateCcw size={18} />
            Reconnect Now
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-900 flex items-center justify-center text-charcoal-50">
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
          path="/about"
          element={
            <ProtectedRoute>
              <AboutPage />
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
        <Route
          path="/profile/:id"
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
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
