-- New tables aren't automatically added to Supabase's realtime publication,
-- so postgres_changes subscriptions on comments/events/event_rsvps (CommentFeed,
-- CheerBar, EventDetailPage's RSVP live-sync) never fire without this - confirmed
-- via manual testing: an insert succeeded and persisted, but only appeared after
-- a full page reload, never through the open realtime channel.
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE event_rsvps;
