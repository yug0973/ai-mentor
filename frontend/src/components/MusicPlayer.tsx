import { useState, useRef, useEffect } from "react";

type Track = {
  title: string;
  artist: string;
  url: string;
};

const CHILL_TRACKS: Track[] = [
  {
    title: "track1.mp3",
    artist: "AI Mentor Originals",
    url: "/music/track1.mp3",
  },
  {
    title: "track2.mp3",
    artist: "AI Mentor Originals",
    url: "/music/track2.mp3",
  },
];

export default function MusicPlayer() {
  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.4);
  const [isMuted, setIsMuted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrack = CHILL_TRACKS[trackIndex];

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.src = currentTrack.url;
      if (isPlaying) {
        audioRef.current.play().catch(() => setIsPlaying(false));
      }
    }
  }, [trackIndex]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const handleNext = () => {
    setTrackIndex((prev) => (prev + 1) % CHILL_TRACKS.length);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val > 0) setIsMuted(false);
  };

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 font-mono-label">
      {/* Audio Element */}
      <audio
        ref={audioRef}
        loop
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* Floating Minimize/Maximize Button */}
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-blaze/30 bg-bg/80 text-blaze shadow-lg backdrop-blur-md transition hover:border-blaze hover:scale-105 active:scale-95"
          title="Open ambient music player"
        >
          {isPlaying ? (
            <span className="flex gap-0.5 items-end h-4 w-4 justify-center">
              <span className="w-0.5 bg-blaze animate-bar-dance-1 h-3"></span>
              <span className="w-0.5 bg-blaze animate-bar-dance-2 h-4"></span>
              <span className="w-0.5 bg-blaze animate-bar-dance-3 h-2"></span>
            </span>
          ) : (
            <span className="text-lg">🎵</span>
          )}
        </button>
      ) : (
        /* Expanded Player Card */
        <div className="w-64 rounded-xl border border-mist/80 bg-panel/90 p-4 shadow-2xl backdrop-blur-lg animate-fade-in transition-all">
          <div className="flex items-center justify-between border-b border-mist/40 pb-2 mb-3">
            <span className="text-[10px] uppercase tracking-widest text-blaze font-bold">
              Ambient Station
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-fog hover:text-parchment text-xs transition"
            >
              ✕ minimize
            </button>
          </div>

          {/* Audio Wave Visualizer */}
          <div className="flex justify-center items-end gap-1 h-8 mb-3 bg-bg/30 rounded border border-mist/20 p-2 overflow-hidden">
            {isPlaying ? (
              Array.from({ length: 12 }).map((_, i) => (
                <span
                  key={i}
                  className="w-1 bg-blaze rounded-t transition-all duration-300"
                  style={{
                    height: `${Math.floor(Math.random() * 80) + 20}%`,
                    animation: `bar-dance-${(i % 3) + 1} 1.2s infinite ease-in-out alternate`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))
            ) : (
              <div className="text-[10px] text-fog/60 tracking-wider">AUDIO VISUALIZER STANDBY</div>
            )}
          </div>

          {/* Track Info */}
          <div className="text-center space-y-0.5 mb-3">
            <p className="text-xs font-semibold text-parchment truncate" title={currentTrack.title}>
              {currentTrack.title}
            </p>
            <p className="text-[10px] text-fog truncate">{currentTrack.artist}</p>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4 mb-3">
            <button
              onClick={togglePlay}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-blaze text-bg transition hover:bg-blaze-dim active:scale-95 text-sm"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button
              onClick={handleNext}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-mist hover:border-fog hover:text-parchment transition text-xs"
              title="Next Track"
            >
              ⏭
            </button>
          </div>

          {/* Volume Control */}
          <div className="flex items-center justify-between gap-2.5 pt-1.5 border-t border-mist/40 text-[10px]">
            <button
              onClick={toggleMute}
              className="text-fog hover:text-parchment text-xs w-4 shrink-0 transition"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted || volume === 0 ? "🔇" : "🔊"}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-full h-1 bg-mist rounded-lg appearance-none cursor-pointer accent-blaze focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
