import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-2 bg-charcoal-800 border-2 border-charcoal-700 rounded-full p-1 shadow-[0_0_10px_rgba(34,197,94,0.2)] transition-all duration-300"
      aria-label="Toggle theme"
    >
      <div
        className={`p-1.5 rounded-full transition-colors duration-300 ${
          theme === 'light' ? 'bg-success-500 text-charcoal-50 shadow-[0_0_10px_rgba(34,197,94,0.8)]' : 'text-charcoal-400 hover:text-charcoal-200'
        }`}
      >
        <Sun size={16} />
      </div>
      <div
        className={`p-1.5 rounded-full transition-colors duration-300 ${
          theme === 'dark' ? 'bg-success-500 text-charcoal-50 shadow-[0_0_10px_rgba(34,197,94,0.8)]' : 'text-charcoal-400 hover:text-charcoal-200'
        }`}
      >
        <Moon size={16} />
      </div>
    </button>
  );
}