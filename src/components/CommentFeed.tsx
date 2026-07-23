import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, EyeOff, Eye, Send, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Comment, Profile } from '../lib/supabase';
import { getComments, postComment, hideComment } from '../lib/comments';
import UserAvatar from './UserAvatar';

type ViewerProfile = Pick<Profile, 'id' | 'display_name' | 'avatar_color' | 'avatar_url' | 'catchphrase'>;

type CommentFeedProps = {
  contextType: 'match' | 'event';
  contextId: string;
  viewerProfile: ViewerProfile | null;
  canModerate: boolean;
  enabled?: boolean;
  disabledMessage?: string;
  defaultExpanded?: boolean;
  renderCheersInline?: boolean;
};

const MAX_LENGTH_BY_CONTEXT: Record<'match' | 'event', number> = {
  match: 100,
  event: 500,
};

export default function CommentFeed({
  contextType,
  contextId,
  viewerProfile,
  canModerate,
  enabled = true,
  disabledMessage = 'Comments are turned off for this match.',
  defaultExpanded = true,
  renderCheersInline = true,
}: CommentFeedProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const feedEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await getComments(contextType, contextId);
      setComments(data);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setLoading(false);
    }
  }, [contextType, contextId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`comments:${contextType}:${contextId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `context_id=eq.${contextId}` },
        (payload) => {
          if ((payload.new as Comment)?.context_type !== contextType) return;
          if (payload.eventType === 'INSERT') {
            setComments(prev => [...prev, payload.new as Comment]);
          } else if (payload.eventType === 'UPDATE') {
            setComments(prev => prev.map(c => c.id === (payload.new as Comment).id ? payload.new as Comment : c));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [contextType, contextId]);

  useEffect(() => {
    if (expanded) feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length, expanded]);

  const maxLength = MAX_LENGTH_BY_CONTEXT[contextType];

  const handleSend = useCallback(async () => {
    if (!viewerProfile || !draft.trim()) return;
    setSending(true);
    try {
      await postComment(contextType, contextId, draft.trim());
      setDraft('');
    } catch (err: any) {
      console.error('Failed to post comment:', err);
      if (err?.message?.includes('Rate limit')) {
        alert('Slow down a little before posting again.');
      } else {
        alert('Failed to post. Please try again.');
      }
    } finally {
      setSending(false);
    }
  }, [viewerProfile, draft, contextType, contextId]);

  const handleHide = useCallback(async (commentId: string) => {
    try {
      await hideComment(commentId);
    } catch (err) {
      console.error('Failed to moderate comment:', err);
    }
  }, []);

  const visibleComments = comments.filter(c => !c.is_hidden || canModerate);

  return (
    <div className="rounded-2xl border border-charcoal-700 bg-charcoal-800/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-charcoal-400" />
          <span className="text-sm font-bold text-charcoal-200">
            Comments {comments.length > 0 && `(${comments.length})`}
          </span>
        </div>
        {expanded ? <ChevronDown size={18} className="text-charcoal-400" /> : <ChevronUp size={18} className="text-charcoal-400" />}
      </button>

      {expanded && (
        <div className="border-t border-charcoal-700">
          <div className="max-h-72 overflow-y-auto px-4 py-3 space-y-3">
            {loading ? (
              <p className="text-xs text-charcoal-500 text-center py-4">Loading comments...</p>
            ) : visibleComments.length === 0 ? (
              <p className="text-xs text-charcoal-500 text-center py-4">No comments yet. Be the first to say something.</p>
            ) : (
              visibleComments.map(c => (
                <div key={c.id} className={`flex items-start gap-2 ${c.is_hidden ? 'opacity-40' : ''}`}>
                  <UserAvatar display_name={c.author_display_name} size="xs" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold text-charcoal-200 truncate">{c.author_display_name}</span>
                      <span className="text-[10px] text-charcoal-500">
                        {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {c.type === 'cheer' && renderCheersInline ? (
                      <span className="text-2xl leading-none">{c.content}</span>
                    ) : (
                      <p className="text-sm text-charcoal-300 break-words">{c.content}</p>
                    )}
                  </div>
                  {canModerate && (
                    <button
                      type="button"
                      onClick={() => handleHide(c.id)}
                      className="p-1 text-charcoal-500 hover:text-charcoal-200 flex-shrink-0"
                      aria-label={c.is_hidden ? 'Hidden' : 'Hide comment'}
                    >
                      {c.is_hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  )}
                </div>
              ))
            )}
            <div ref={feedEndRef} />
          </div>

          {!enabled ? (
            <p className="px-4 py-3 border-t border-charcoal-700 text-xs text-charcoal-500 text-center">{disabledMessage}</p>
          ) : !viewerProfile ? (
            <p className="px-4 py-3 border-t border-charcoal-700 text-xs text-charcoal-500 text-center">Log in to join the conversation.</p>
          ) : (
            <div className="px-4 py-3 border-t border-charcoal-700 flex gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, maxLength))}
                placeholder="Say something..."
                maxLength={maxLength}
                className="flex-1 bg-charcoal-900 border border-charcoal-700 rounded-xl px-3 py-2 text-sm text-charcoal-100 placeholder-charcoal-500"
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !draft.trim()}
                className="p-2.5 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white rounded-xl transition-colors flex-shrink-0"
                aria-label="Send"
              >
                <Send size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
