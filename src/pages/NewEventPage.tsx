import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar } from 'lucide-react';
import { createEvent, getEventById, updateEvent } from '../lib/events';
import { useAuth } from '../contexts/AuthContext';

// Converts a stored UTC ISO timestamp to the local value a datetime-local
// input expects - without this, editing an event would display (and could
// silently resave) the wrong time for anyone not in UTC.
function toLocalInputValue(isoString: string): string {
  const d = new Date(isoString);
  const offsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

export default function NewEventPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { currentUser } = useAuth();
  const isEditMode = !!id;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDatetime, setEventDatetime] = useState(new Date().toISOString().slice(0, 16));
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(isEditMode);
  const [notAllowed, setNotAllowed] = useState(false);

  const loadEvent = useCallback(async () => {
    if (!id) return;
    try {
      const event = await getEventById(id);
      if (!event || event.created_by !== currentUser?.id) {
        setNotAllowed(true);
        return;
      }
      setTitle(event.title);
      setDescription(event.description || '');
      setEventDatetime(toLocalInputValue(event.event_datetime));
      setLocation(event.location || '');
    } catch (err) {
      console.error('Failed to load event:', err);
      setNotAllowed(true);
    } finally {
      setLoading(false);
    }
  }, [id, currentUser?.id]);

  useEffect(() => { if (isEditMode) loadEvent(); }, [isEditMode, loadEvent]);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError('');
    try {
      const input = {
        title: title.trim(),
        description: description.trim() || null,
        event_datetime: new Date(eventDatetime).toISOString(),
        location: location.trim() || null,
      };
      const event = isEditMode && id ? await updateEvent(id, input) : await createEvent(input);
      navigate(`/events/${event.id}`, { replace: true });
    } catch (err: any) {
      console.error(`Failed to ${isEditMode ? 'update' : 'create'} event:`, err);
      setError(`Failed to ${isEditMode ? 'save changes' : 'create event'}. Please try again.`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal-900 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notAllowed) {
    return (
      <div className="min-h-screen bg-charcoal-900 flex items-center justify-center text-center p-6">
        <div>
          <p className="text-5xl mb-4">🔒</p>
          <h1 className="text-2xl font-bold text-charcoal-100 mb-2">Can't Edit This Event</h1>
          <p className="text-charcoal-400 mb-2">Only the event's creator can edit it.</p>
          <button onClick={() => navigate('/')} className="text-accent-400 hover:underline mt-2">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-charcoal-900 pb-24">
      <div className="bg-charcoal-800 border-b-2 border-charcoal-700 px-4 pt-12 pb-4 safe-top flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-charcoal-700 text-charcoal-300">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-charcoal-50">{isEditMode ? 'Edit Event' : 'Plan an Event'}</h1>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <div className="card p-4 space-y-3">
          <div>
            <label className="text-[10px] uppercase font-bold text-charcoal-500 mb-1 block tracking-widest">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Friday Night Golf @ Ian's"
              maxLength={100}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-charcoal-500 mb-1 block tracking-widest">Date & Time</label>
            <input
              type="datetime-local"
              value={eventDatetime}
              onChange={(e) => setEventDatetime(e.target.value)}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-charcoal-500 mb-1 block tracking-widest">Location (optional)</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Ian's backyard"
              maxLength={200}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-charcoal-500 mb-1 block tracking-widest">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Anything people should know before showing up"
              maxLength={2000}
              rows={4}
              className="input-field w-full resize-none"
            />
          </div>
        </div>

        {error && <p className="text-sm text-danger-400 text-center">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={saving || !title.trim()}
          className="btn-success w-full flex items-center justify-center gap-2 text-lg py-4 disabled:opacity-50"
        >
          <Calendar size={20} />
          {saving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Event'}
        </button>
      </div>
    </div>
  );
}
