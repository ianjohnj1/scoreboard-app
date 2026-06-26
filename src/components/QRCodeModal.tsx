import React, { useState } from 'react';
import { X, ExternalLink, Copy, Check } from 'lucide-react';
import { getSpectatorUrl, getSportIcon, getSportLabel } from '../lib/matches';
import type { MatchRoom } from '../lib/supabase';

type QRCodeModalProps = {
  match: MatchRoom;
  onClose: () => void;
};

// Simple QR code via a public API - generates SVG data URL
function QRCodeImage({ url, size = 200 }: { url: string; size?: number }) {
  // Use a data matrix-like visual placeholder with the URL encoded
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}&size=${size}x${size}&bgcolor=18181b&color=f4f4f5&format=png`;
  return (
    <img
      src={qrApiUrl}
      alt="QR Code"
      width={size}
      height={size}
      className="rounded-xl"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

export default function QRCodeModal({ match, onClose }: QRCodeModalProps) {
  const [copied, setCopied] = useState(false);
  const spectatorUrl = getSpectatorUrl(match.room_code);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(spectatorUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-charcoal-700">
          <div>
            <h2 className="text-lg font-bold text-charcoal-100">Spectator QR Code</h2>
            <p className="text-charcoal-400 text-sm">
              {getSportIcon(match.sport)} {getSportLabel(match.sport, match.custom_game_name)}
              {' · '}<span className="font-mono">{match.room_code}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-charcoal-700 text-charcoal-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4">
          <div className="p-3 bg-charcoal-950 rounded-2xl border-2 border-charcoal-700">
            <QRCodeImage url={spectatorUrl} size={200} />
          </div>
          <p className="text-charcoal-400 text-sm text-center">
            Scan to watch this match live on any device
          </p>
          <div className="w-full flex gap-2">
            <div className="flex-1 bg-charcoal-700 rounded-lg px-3 py-2 text-charcoal-300 text-xs font-mono truncate border border-charcoal-600">
              {spectatorUrl}
            </div>
            <button
              onClick={handleCopy}
              className={`px-3 py-2 rounded-lg border transition-all duration-150 text-sm font-medium flex items-center gap-1.5 ${
                copied
                  ? 'bg-success-600/20 border-success-600/30 text-success-400'
                  : 'bg-charcoal-700 border-charcoal-600 text-charcoal-300 hover:bg-charcoal-600'
              }`}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <a
            href={spectatorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
          >
            <ExternalLink size={16} />
            Open Spectator View
          </a>
        </div>
      </div>
    </div>
  );
}
