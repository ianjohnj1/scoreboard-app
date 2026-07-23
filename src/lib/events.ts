import { supabase } from './supabase';
import type { Event, EventRsvp } from './supabase';

export async function getUpcomingEvents(limit = 5): Promise<Event[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .gte('event_datetime', new Date().toISOString())
    .order('event_datetime', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getAllEvents(): Promise<Event[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('event_datetime', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getEventById(id: string): Promise<Event | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createEvent(input: {
  title: string;
  description?: string | null;
  event_datetime: string;
  location?: string | null;
}): Promise<Event> {
  const { data, error } = await supabase
    .from('events')
    // created_by is stamped server-side by trg_guard_events - never sent from the client.
    .insert(input)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function updateEvent(id: string, patch: {
  title: string;
  description?: string | null;
  event_datetime: string;
  location?: string | null;
}): Promise<Event> {
  const { data, error } = await supabase
    .from('events')
    // created_by is protected server-side by guard_events_protected_columns - not part of patch.
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function deleteEvent(id: string): Promise<void> {
  // trg_events_cleanup (BEFORE DELETE on events) purges this event's comments
  // and event_rsvps server-side - no client-side cleanup calls needed here.
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}

export async function getEventRsvps(eventId: string): Promise<EventRsvp[]> {
  const { data, error } = await supabase
    .from('event_rsvps')
    .select('*')
    .eq('event_id', eventId);

  if (error) throw error;
  return data || [];
}

export async function setEventRsvp(eventId: string, status: EventRsvp['status']): Promise<void> {
  // player_id is stamped server-side by trg_guard_event_rsvps - never sent from the client.
  const { error } = await supabase
    .from('event_rsvps')
    .upsert({ event_id: eventId, status }, { onConflict: 'event_id,player_id' });

  if (error) throw error;
}
