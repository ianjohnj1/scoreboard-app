import { Link } from 'react-router-dom';
import { ArrowLeft, Info, Radio, Trophy, Users, Zap } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

const SPORTS = [
  'Cricket Classic',
  'Cricket Backyard',
  'Golf',
  'Chip Off',
  'Darts Countdown',
  'Darts Around the World',
  'Darts Killer',
  'Table Tennis',
  'Pool',
  'Basketball',
  'Cards',
  'Custom Sport',
];

const DIFFERENTIATORS = [
  'Real-time live scoring across multiple active rooms',
  'Dedicated spectator and broadcast views for read-only match watching',
  'Persistent player profiles with avatars, catchphrases, history, and stats',
  'Flexible house rules, guest players, and team or individual match setups',
  'Leaderboards and Season Points that make every match count over time',
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-charcoal-900 pb-24 text-charcoal-50">
      <div className="bg-charcoal-800 border-b border-charcoal-700 px-4 pt-12 pb-4 safe-top transition-colors duration-300">
        <div className="max-w-3xl mx-auto flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              to="/profile"
              className="inline-flex items-center gap-2 text-charcoal-400 hover:text-charcoal-200 text-sm font-semibold mb-3 transition-colors"
            >
              <ArrowLeft size={16} />
              Back to Profile
            </Link>
            <div className="flex items-center gap-2">
              <Info size={20} className="text-accent-400" />
              <h1 className="text-2xl font-black text-charcoal-50">About The App</h1>
            </div>
            <p className="text-charcoal-400 text-sm mt-1">
              A quick guide for someone seeing the app for the first time.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="p-4 max-w-3xl mx-auto space-y-6">
        <section className="card p-5">
          <p className="text-accent-400 text-xs font-bold uppercase tracking-[0.2em] mb-2">Elevator Pitch</p>
          <p className="text-lg leading-relaxed text-charcoal-100">
            This app is a real-time social sports scoring platform where players can set up matches, score them live
            across multiple sports, share spectator views, and build long-term stats, profiles, and leaderboards.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={18} className="text-warning-400" />
              <h2 className="text-lg font-black">What It Is</h2>
            </div>
            <p className="text-charcoal-300 text-sm leading-relaxed">
              At its core, this is a live scoreboard app built for real groups of people playing sport together. It
              goes beyond basic score entry by turning every match into part of a larger player identity and stats
              ecosystem.
            </p>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Users size={18} className="text-accent-400" />
              <h2 className="text-lg font-black">Who It&apos;s For</h2>
            </div>
            <p className="text-charcoal-300 text-sm leading-relaxed">
              It suits groups of friends, families, clubs, pubs, and casual competitions that want a polished way to
              run matches, display scores live, and keep the results meaningful over time.
            </p>
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Radio size={18} className="text-success-400" />
            <h2 className="text-lg font-black">How It Works</h2>
          </div>
          <div className="space-y-3 text-sm text-charcoal-300">
            <p>
              Players log in, land on the dashboard, and start a new match by choosing a sport, selecting a variant,
              setting house rules, and building a roster from registered users or quick local guests.
            </p>
            <p>
              Once the match begins, the live match room becomes the control centre for scoring, sharing, and display
              management.
            </p>
            <p>
              Spectators can join a separate read-only room to follow the action live, and when the match ends the
              result flows into history, player profiles, leaderboards, and Season Points.
            </p>
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={18} className="text-warning-400" />
            <h2 className="text-lg font-black">Sports &amp; Modes</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((sport) => (
              <span
                key={sport}
                className="px-3 py-1.5 rounded-full border border-charcoal-700 bg-charcoal-800 text-charcoal-200 text-xs font-semibold"
              >
                {sport}
              </span>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <p className="text-accent-400 text-xs font-bold uppercase tracking-[0.2em] mb-3">Why It Feels Different</p>
          <div className="space-y-2">
            {DIFFERENTIATORS.map((item) => (
              <div key={item} className="flex items-start gap-3 text-sm text-charcoal-300">
                <div className="w-2 h-2 rounded-full bg-accent-500 mt-1.5 flex-shrink-0" />
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <p className="text-warning-400 text-xs font-bold uppercase tracking-[0.2em] mb-3">Why Players Keep Coming Back</p>
          <p className="text-sm text-charcoal-300 leading-relaxed">
            Every match contributes to something bigger than a single session. Players build stats, compare themselves
            on leaderboards, earn Season Points, and develop recognisable in-app identities through their profile
            picture, catchphrase, and performance history.
          </p>
        </section>
      </div>
    </div>
  );
}
