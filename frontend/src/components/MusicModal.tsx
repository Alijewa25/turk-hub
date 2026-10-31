import React, { useState } from 'react';
import { Music, Play, Square, X } from 'lucide-react';

interface MusicModalProps {
  open: boolean;
  onClose: () => void;
}

export const MusicModal: React.FC<MusicModalProps> = ({ open, onClose }) => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioCtx, setAudioCtx] = useState<AudioContext | null>(null);

  if (!open) return null;

  const playEthnicSound = (type: string) => {
    if (playingId === type) {
      if (audioCtx) audioCtx.close();
      setAudioCtx(null);
      setPlayingId(null);
      return;
    }

    if (audioCtx) audioCtx.close();

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    setAudioCtx(ctx);
    setPlayingId(type);

    // Etnik alət melodiyası sintezi (Kopuz / Dombra / Tar)
    const freqs = type === 'kopuz' ? [146.83, 220, 293.66] : type === 'dombra' ? [196, 293.66, 392] : [220, 329.63, 440];
    let noteIndex = 0;

    const interval = setInterval(() => {
      if (ctx.state === 'closed') {
        clearInterval(interval);
        return;
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type === 'tar' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freqs[noteIndex % freqs.length], ctx.currentTime);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4);

      noteIndex++;
    }, 250);
  };

  const handleClose = () => {
    if (audioCtx) audioCtx.close();
    setPlayingId(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-skyBlue" />
            <h3 className="text-sm font-bold text-slate-100">Ethno-Music Kitabxanası</h3>
          </div>
          <button onClick={handleClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        <div className="space-y-2">
          {[
            { id: 'kopuz', title: 'Kopuz', desc: 'Qədim türk simli aləti' },
            { id: 'dombra', title: 'Dombra', desc: 'Qazax və qırğız ritmləri' },
            { id: 'tar', title: 'Tar', desc: 'Azərbaycan muğam aləti' }
          ].map((item) => (
            <div key={item.id} className="p-3 bg-black/60 border border-neutral-800 rounded-xl flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-100">{item.title}</h4>
                <p className="text-[10px] text-slate-400">{item.desc}</p>
              </div>
              <button
                onClick={() => playEthnicSound(item.id)}
                className="w-9 h-9 rounded-full bg-skyBlue text-black flex items-center justify-center font-bold hover:scale-105 transition-transform"
              >
                {playingId === item.id ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 ml-0.5 fill-current" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
