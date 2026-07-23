import { useCallback, useState } from 'react';
import { postComment } from '../lib/comments';
import type { Profile } from '../lib/supabase';

type ViewerProfile = Pick<Profile, 'id' | 'display_name' | 'avatar_color' | 'avatar_url' | 'catchphrase'>;

type CheerBarProps = {
  contextId: string;
  viewerProfile: ViewerProfile | null;
  quickEmojis?: string[];
};

const DEFAULT_QUICK_EMOJIS = ['\u{1F525}', '\u{1F44F}', '\u{1F602}', '\u{1F4AA}', '\u{1F389}']; // 🔥 👏 😂 💪 🎉

type Burst = { id: string; emoji: string };

export default function CheerBar({ contextId, viewerProfile, quickEmojis = DEFAULT_QUICK_EMOJIS }: CheerBarProps) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [customEmoji, setCustomEmoji] = useState('');

  const fireBurst = useCallback((emoji: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setBursts(prev => [...prev, { id, emoji }]);
    setTimeout(() => setBursts(prev => prev.filter(b => b.id !== id)), 900);
  }, []);

  const sendCheer = useCallback(async (emoji: string) => {
    if (!emoji.trim() || !viewerProfile) return;
    fireBurst(emoji);
    try {
      await postComment('match', contextId, emoji, 'cheer');
    } catch (err: any) {
      console.error('Failed to post cheer:', err);
      if (!err?.message?.includes('Rate limit')) {
        alert('Failed to send cheer. Please try again.');
      }
    }
  }, [viewerProfile, contextId, fireBurst]);

  if (!viewerProfile) {
    return (
      <div className="rounded-2xl border border-charcoal-700 bg-charcoal-800/60 px-4 py-3">
        <p className="text-xs text-charcoal-500 text-center">Log in to cheer.</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border border-charcoal-700 bg-charcoal-800/60 px-4 py-3">
      {/* Local burst feedback - independent of any broadcast-side animation */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center overflow-visible">
        {bursts.map(b => (
          <span key={b.id} className="absolute text-3xl animate-cheer-burst">{b.emoji}</span>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          {quickEmojis.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => sendCheer(emoji)}
              className="w-9 h-9 rounded-xl bg-charcoal-900 hover:bg-charcoal-700 active:scale-90 transition-all text-xl flex items-center justify-center"
            >
              {emoji}
            </button>
          ))}
        </div>
        {/* Relies on the OS/browser's own emoji picker (mobile emoji keyboard,
            Win+. / Ctrl+Cmd+Space on desktop) rather than a custom-built one -
            keeps the underlying set genuinely unrestricted, per spec. */}
        <input
          type="text"
          value={customEmoji}
          onChange={(e) => setCustomEmoji(e.target.value)}
          placeholder="Any emoji..."
          className="w-24 flex-shrink-0 bg-charcoal-900 border border-charcoal-700 rounded-xl px-3 py-2 text-lg text-center text-charcoal-100 placeholder-charcoal-500 placeholder:text-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && customEmoji.trim()) {
              sendCheer(customEmoji.trim());
              setCustomEmoji('');
            }
          }}
        />
      </div>
    </div>
  );
}
