import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ChevronRight, MapPin, AlertCircle, RotateCcw, Plus } from 'lucide-react';
import { getAllEvents } from '../lib/events';
import ThemeToggle from '../components/ThemeToggle';
import type { Event } from '../lib/supabase';

export default function EventsListPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isMounted?: () => boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllEvents();
      if (isMounted && !isMounted()) return;
      setEvents(data);
    } catch (err) {
      console.error('Error loading events:', err);
      if (isMounted && !isMounted()) return;
      setError('Failed to load events.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    load(() => mounted);
    return () => { mounted = false; };
  }, [load]);

  return (
    <div className="min-h-screen bg-charcoal-900 pb-24">
      <div className="bg-charcoal-800 border-b border-charcoal-700 px-4 pt-12 pb-4 safe-top flex justify-between items-center transition-colors duration-300">
        <div>
          <h1 className="text-xl font-bold text-charcoal-50">Events</h1>
          <p className="text-charcoal-400 text-sm">Everything planned, past and upcoming</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/events/new')}
            className="p-2 rounded-xl hover:bg-charcoal-700 text-charcoal-300 hover:text-charcoal-100 transition-colors"
            aria-label="Plan an event"
            title="Plan an event"
          >
            <Plus size={20} />
          </button>
          <ThemeToggle />
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {error && (
          <div className="bg-danger-900/20 border border-danger-500/30 rounded-xl p-6 text-center mb-4">
            <div className="flex items-center justify-center gap-3 text-danger-400 mb-4">
              <AlertCircle size={20} />
              <span className="font-bold">{error}</span>
            </div>
            <button
              onClick={() => load()}
              className="px-4 py-2 bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-50 text-sm font-bold rounded-lg transition-all flex items-center gap-2 mx-auto"
            >
              <RotateCcw size={14} />
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-16 card shimmer-bg rounded-xl" />)}
          </div>
        ) : events.length === 0 ? (
          <div className="card p-8 text-center">
            <Calendar size={32} className="text-charcoal-600 mx-auto mb-3" />
            <p className="text-charcoal-400">No events planned yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map(event => {
              const isPast = new Date(event.event_datetime) < new Date();
              return (
                <div
                  key={event.id}
                  onClick={() => navigate(`/events/${event.id}`)}
                  className="w-full card p-4 flex items-center gap-3 hover:border-charcoal-600 active:scale-[0.99] transition-all text-left cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl bg-charcoal-700 flex items-center justify-center flex-shrink-0">
                    <Calendar size={18} className="text-charcoal-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-charcoal-100 text-sm truncate">{event.title}</span>
                      <span className={`pill text-xs ${isPast ? 'pill-completed' : 'pill-active'}`}>
                        {isPast ? 'Past' : 'Upcoming'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-charcoal-500 text-xs">
                        {new Date(event.event_datetime).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                      {event.location && (
                        <>
                          <span className="text-charcoal-600 text-xs">•</span>
                          <span className="text-charcoal-500 text-xs flex items-center gap-1 truncate">
                            <MapPin size={10} />
                            {event.location}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-charcoal-500 flex-shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
