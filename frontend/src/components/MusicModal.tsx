import React, { useEffect, useRef, useState } from 'react';
import { Music, Play, Square, X } from 'lucide-react';

interface MusicModalProps {
  open: boolean;
  onClose: () => void;
}

const TRACKS = [
  { id: 'kopuz', title: 'Kopuz', desc: 'Qədim türk simli aləti - Göktürk musiqisi', freqs: [146.83, 220, 293.66], wave: 'triangle' as OscillatorType },
  { id: 'dombra', title: 'Dombra', desc: 'Qazax və Qırğız xalq mahnıları', freqs: [196, 293.66, 392], wave: 'triangle' as OscillatorType },
  { id: 'tar', title: 'Tar', desc: 'Azərbaycan muğam və xalq mahnıları', freqs: [220, 329.63, 440], wave: 'sawtooth' as OscillatorType },
  { id: 'komuz', title: 'Komuz', desc: 'Qırğız epik mahnıları və küylər', freqs: [164.81, 246.94, 329.63], wave: 'triangle' as OscillatorType },
  { id: 'dutar', title: 'Dutar', desc: 'Özbək və Türkmən xalq mahnıları', freqs: [174.61, 261.63, 349.23], wave: 'sawtooth' as OscillatorType },
  { id: 'saz', title: 'Bağlama/Saz', desc: 'Türk Anadolu xalq mahnıları', freqs: [196, 293.66, 440, 523.25], wave: 'triangle' as OscillatorType },
  { id: 'igil', title: 'İgil', desc: 'Altay-Türk simli aləti', freqs: [130.81, 196, 261.63], wave: 'triangle' as OscillatorType },
  { id: 'ghijak', title: 'Qobuz/Ghijak', desc: 'Türkmən xalq havaları', freqs: [185, 277, 370], wave: 'sawtooth' as OscillatorType },
];

export const MusicModal: React.FC<MusicModalProps> = ({ open, onClose }) => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPlayback = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    setPlayingId(null);
  };

  useEffect(() => {
    if (!open) stopPlayback();
    return () => stopPlayback();
  }, [open]);

  if (!open) return null;

  const playEthnicSound = (type: string) => {
    if (playingId === type) {
      stopPlayback();
      return;
    }

    stopPlayback();

    const track = TRACKS.find((t) => t.id === type);
    if (!track) return;

    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new Ctx();
    audioCtxRef.current = ctx;
    setPlayingId(type);

    let noteIndex = 0;
    intervalRef.current = setInterval(() => {
      if (ctx.state === 'closed') {
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = track.wave;
      osc.frequency.setValueAtTime(track.freqs[noteIndex % track.freqs.length], ctx.currentTime);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4);
      noteIndex += 1;
    }, 250);
  };

  const handleClose = () => {
    stopPlayback();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-skyBlue" />
            <h3 className="text-sm font-bold text-slate-100">Pan-Türk Ethno-Music Kitabxanası</h3>
          </div>
          <button onClick={handleClose} aria-label="Bağla">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="space-y-2">
          {TRACKS.map((item) => (
            <div
              key={item.id}
              className="p-3 bg-black/60 border border-neutral-800 rounded-xl flex items-center justify-between"
            >
              <div>
                <h4 className="text-xs font-bold text-slate-100">{item.title}</h4>
                <p className="text-[10px] text-slate-400">{item.desc}</p>
              </div>
              <button
                onClick={() => playEthnicSound(item.id)}
                className="w-9 h-9 rounded-full bg-skyBlue text-black flex items-center justify-center font-bold hover:scale-105 transition-transform"
                aria-label={playingId === item.id ? 'Dayandır' : 'Oxut'}
              >
                {playingId === item.id ? (
                  <Square className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5 fill-current" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
