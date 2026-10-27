import { useState, useRef, useEffect } from "react";
import { Microphone, Square, Play, Pause, Undo, ArrowRight, WarningCircle } from "iconoir-react";
import { Modal } from "../../shared/components/Modal";

interface VoiceRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (audioBlob: Blob, durationSeconds: number, title?: string) => Promise<any>;
}

export function VoiceRecorderModal({ isOpen, onClose, onSave }: VoiceRecorderModalProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen]);

  const resetState = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setIsRecording(false);
    setDuration(0);
    setAudioUrl(null);
    setAudioBlob(null);
    setIsPlaying(false);
    setError(null);
    setIsSaving(false);
  };

  const startRecording = async () => {
    setError(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        // Stop all audio tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(200); // 200ms slice
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Microphone access error:", err);
      setError("Microphone access was denied or unavailable. Please enable microphone permissions in your browser.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const togglePlayback = () => {
    if (!audioPlayerRef.current || !audioUrl) return;
    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  const handleSave = async () => {
    if (!audioBlob) return;
    setIsSaving(true);
    try {
      await onSave(audioBlob, duration);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save voice recording.");
    } finally {
      setIsSaving(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-md text-center"
      aria-label="Record Voice Note"
    >
      <div className="text-center mb-6">
        <h3 className="text-base font-bold text-text-primary mb-1">Record Voice Note</h3>
        <p className="text-xs text-text-muted">Speak your thoughts, lectures, or ideas</p>
      </div>

      {/* Recording Visualizer / Timer */}
      <div className="flex flex-col items-center justify-center py-2">
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 mb-4 ${
            isRecording
              ? "bg-red-500/10 text-red-500 border border-red-500/40 animate-pulse"
              : audioBlob
              ? "bg-bg-subtle text-text-primary border border-border-color"
              : "bg-bg-subtle text-text-muted border border-border-color"
          }`}
        >
          <Microphone size={32} strokeWidth={1.75} />
        </div>

        <div className="text-2xl font-mono font-semibold text-text-primary tracking-wider mb-1">
          {formatTime(duration)}
        </div>

        <p className="text-xs text-text-muted h-4">
          {isRecording ? "Recording in progress..." : audioBlob ? "Recording ready" : "Ready to record"}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-500 mb-4 text-left">
          <WarningCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Action Controls */}
      <div className="flex items-center justify-center gap-3 pt-2">
        {!isRecording && !audioBlob && (
          <button
            onClick={startRecording}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 transition-all shadow-xs active:scale-98 cursor-pointer"
          >
            <Microphone size={15} strokeWidth={1.75} />
            <span>Start Recording</span>
          </button>
        )}

        {isRecording && (
          <button
            onClick={stopRecording}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-all shadow-xs active:scale-98 cursor-pointer"
          >
            <Square size={14} fill="currentColor" />
            <span>Stop Recording</span>
          </button>
        )}

        {audioBlob && !isRecording && (
          <div className="flex flex-col gap-3 w-full">
            <audio
              ref={audioPlayerRef}
              src={audioUrl || ""}
              onEnded={handleAudioEnded}
              className="hidden"
            />

            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={togglePlayback}
                className="p-2 rounded-lg bg-bg-subtle hover:bg-slate-200 dark:hover:bg-slate-800 text-text-primary transition-colors cursor-pointer"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} className="translate-x-0.5" />}
              </button>

              <button
                type="button"
                onClick={resetState}
                className="p-2 rounded-lg bg-bg-subtle hover:bg-slate-200 dark:hover:bg-slate-800 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                title="Record again"
                aria-label="Record again"
              >
                <Undo size={18} />
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-3.5 rounded-lg text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-subtle transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 disabled:opacity-40 transition-all shadow-xs cursor-pointer"
              >
                <span>{isSaving ? "Saving..." : "Save note"}</span>
                <ArrowRight size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
