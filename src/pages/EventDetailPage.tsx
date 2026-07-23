import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, MapPin, Pencil, Trash2 } from 'lucide-react';
import { deleteEvent, getEventById, getEventRsvps, setEventRsvp } from '../lib/events';
import { supabase, SAFE_PROFILE_COLUMNS } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import UserAvatar from '../components/UserAvatar';
import CommentFeed from '../components/CommentFeed';
import Modal from '../components/Modal';
import type { Event, EventRsvp, Profile } from '../lib/supabase';

const STATUS_META: Record<EventRsvp['status'], { label: string; className: string }> = {
  going: { label: 'Going', className: 'bg-success-600/20 text-success-400 border-success-600/30' },
  maybe: { label: 'Maybe', className: 'bg-warning-500/20 text-warning-400 border-warning-500/30' },
  not_going: { label: "Can't Go", className: 'bg-charcoal-600/50 text-charcoal-300 border-charcoal-600' },
};

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, isAdmin } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [rsvps, setRsvps] = useState<EventRsvp[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [rsvpSaving, setRsvpSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    const [ev, rs] = await Promise.all([getEventById(id), getEventRsvps(id)]);
    setEvent(ev);
    setRsvps(rs);

    const pids = [...new Set(rs.map(r => r.player_id))];
    if (pids.length > 0) {
      const { data } = await supabase.from('profiles').select(SAFE_PROFILE_COLUMNS).in('id', pids);
      setProfiles(new Map((data || []).map(p => [p.id, { ...p, pin_hash: null } as Profile])));
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`event-rsvps:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_rsvps', filter: `event_id=eq.${id}` }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, loadData]);

  const handleRsvp = async (status: EventRsvp['status']) => {
    if (!id || rsvpSaving) return;
    setRsvpSaving(true);
    try {
      await setEventRsvp(id, status);
      await loadData();
    } catch (err) {
      console.error('Failed to save RSVP:', err);
      alert('Failed to save your RSVP. Please try again.');
    } finally {
      setRsvpSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!id || deleting) return;
    setDeleting(true);
    try {
      await deleteEvent(id);
      navigate('/');
    } catch (err) {
      console.error('Failed to delete event:', err);
      alert('Failed to cancel event. Please try again.');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-900 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-charcoal-900 flex items-center justify-center text-center p-6">
        <div>
          <p className="text-5xl mb-4">📅</p>
          <h1 className="text-2xl font-bold text-charcoal-100 mb-2">Event Not Found</h1>
          <button onClick={() => navigate('/')} className="text-accent-400 hover:underline mt-2">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const myRsvp = rsvps.find(r => r.player_id === currentUser?.id)?.status;
  const groups: Record<EventRsvp['status'], EventRsvp[]> = {
    going: rsvps.filter(r => r.status === 'going'),
    maybe: rsvps.filter(r => r.status === 'maybe'),
    not_going: rsvps.filter(r => r.status === 'not_going'),
  };

  return (
    <div className="min-h-screen bg-charcoal-900 pb-24">
      <div className="bg-charcoal-800 border-b-2 border-charcoal-700 px-4 pt-12 pb-4 safe-top flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-charcoal-700 text-charcoal-300">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-charcoal-50 truncate flex-1">{event.title}</h1>
        {(currentUser?.id === event.created_by || isAdmin) && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => navigate(`/events/${event.id}/edit`)}
              className="p-2 rounded-xl hover:bg-charcoal-700 text-charcoal-300"
              aria-label="Edit event"
            >
              <Pencil size={18} />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className="p-2 rounded-xl hover:bg-danger-900/30 text-danger-400 hover:text-danger-300 disabled:opacity-50"
              aria-label="Cancel event"
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-2 text-charcoal-300 text-sm">
            <Clock size={14} className="text-accent-400 flex-shrink-0" />
            {new Date(event.event_datetime).toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </div>
          {event.location && (
            <div className="flex items-center gap-2 text-charcoal-300 text-sm">
              <MapPin size={14} className="text-accent-400 flex-shrink-0" />
              {event.location}
            </div>
          )}
          {event.description && (
            <p className="text-charcoal-400 text-sm pt-2 border-t border-charcoal-700 whitespace-pre-wrap">{event.description}</p>
          )}
        </div>

        {/* RSVP controls */}
        <div className="grid grid-cols-3 gap-2">
          {(['going', 'maybe', 'not_going'] as const).map(status => (
            <button
              key={status}
              onClick={() => handleRsvp(status)}
              disabled={rsvpSaving}
              className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition-all disabled:opacity-50 ${
                myRsvp === status
                  ? STATUS_META[status].className
                  : 'bg-charcoal-800 border-charcoal-700 text-charcoal-400 hover:text-charcoal-200'
              }`}
            >
              {STATUS_META[status].label}
            </button>
          ))}
        </div>

        {/* Attendee list - "who's coming" is the headline ask, kept prominent */}
        <div className="space-y-3">
          {(['going', 'maybe', 'not_going'] as const).map(status => (
            groups[status].length > 0 && (
              <div key={status}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-charcoal-500 mb-2">
                  {STATUS_META[status].label} ({groups[status].length})
                </h3>
                <div className="space-y-2">
                  {groups[status].map(rsvp => {
                    const profile = profiles.get(rsvp.player_id);
                    if (!profile) return null;
                    return (
                      <div key={rsvp.player_id} className="flex items-center gap-3 card p-2.5">
                        <UserAvatar
                          display_name={profile.display_name}
                          avatar_color={profile.avatar_color}
                          avatar_url={profile.avatar_url}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-charcoal-100 truncate">{profile.display_name}</p>
                          {profile.catchphrase && (
                            <p className="text-accent-400 text-[10px] italic truncate">"{profile.catchphrase}"</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ))}
        </div>

        {/* No CheerBar here - cheers are a match-specific, live-energy interaction */}
        <CommentFeed
          contextType="event"
          contextId={event.id}
          viewerProfile={currentUser}
          canModerate={currentUser?.id === event.created_by}
        />
      </div>

      {/* In-app confirm, not window.confirm() - native dialogs don't reliably
          fire in every embedded/preview browser context. */}
      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Cancel this event?">
        <p className="text-charcoal-300 text-sm mb-4">This cannot be undone. Everyone's RSVPs and comments on this event will be removed too.</p>
        <div className="flex gap-2">
          <button
            onClick={() => setShowDeleteConfirm(false)}
            disabled={deleting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-charcoal-700 hover:bg-charcoal-600 text-charcoal-200 font-bold text-sm transition-colors disabled:opacity-50"
          >
            Keep Event
          </button>
          <button
            onClick={confirmDelete}
            disabled={deleting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-danger-600 hover:bg-danger-500 text-white font-bold text-sm transition-colors disabled:opacity-50"
          >
            {deleting ? 'Cancelling...' : 'Cancel Event'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
