import { NavLink, useLocation } from 'react-router-dom';
import { Home, Clock, Trophy, User, Calendar } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/events', icon: Calendar, label: 'Events' },
  { path: '/history', icon: Clock, label: 'History' },
  { path: '/leaderboard', icon: Trophy, label: 'Leaders' },
  { path: '/profile', icon: User, label: 'Profile' },
];

export default function BottomNav() {
  const location = useLocation();

  // Hide on match room, spectator, new-match pages
  const hidden = ['/match/', '/spectate/', '/new-match', '/login'].some(p => location.pathname.startsWith(p));
  if (hidden) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-charcoal-800/95 backdrop-blur-md border-t border-charcoal-700 z-40 safe-bottom">
      <div className="flex max-w-lg mx-auto">
        {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
          const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
          return (
            <NavLink
              key={path}
              to={path}
              className={`nav-tab ${isActive ? 'active' : ''}`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
