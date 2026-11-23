import { useEffect, useRef, useState } from "react";

type Soundscape = { context: AudioContext; master: GainNode; lastCue: number };

export function useSoundscape() {
  const audio = useRef<Soundscape | null>(null);
  const mounted = useRef(true);
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [volume, setVolume] = useState(20);
  const [error, setError] = useState("");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void audio.current?.context.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    function visibilityChanged() {
      const context = audio.current?.context;
      if (!context || context.state === "closed") return;
      const operation = document.hidden ? context.suspend() : context.resume();
      void operation.catch(() => {
        void context.close().catch(() => {});
        audio.current = null;
        if (!mounted.current) return;
        setEnabled(false);
        setError("Ambience paused by your browser. Enable it again to continue.");
      });
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => document.removeEventListener("visibilitychange", visibilityChanged);
  }, [enabled]);

  async function toggle() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      if (!audio.current || audio.current.context.state === "closed") {
        if (typeof window.AudioContext !== "function") throw new Error("unsupported");
        const context = new AudioContext();
        const master = context.createGain();
        audio.current = { context, master, lastCue: -Infinity };
        master.gain.value = 0;
        master.connect(context.destination);
        const drone = context.createGain();
        drone.gain.value = 0.14;
        drone.connect(master);
        for (const frequency of [55, 82.41, 110.2]) {
          const oscillator = context.createOscillator();
          oscillator.type = "sine";
          oscillator.frequency.value = frequency;
          oscillator.connect(drone);
          oscillator.start();
        }
      }
      const { context, master } = audio.current;
      if (enabled) {
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setTargetAtTime(0, context.currentTime, 0.025);
        await new Promise(resolve => setTimeout(resolve, 100));
        if (context.state !== "closed") await context.suspend();
      } else {
        await context.resume();
        if (document.hidden) await context.suspend();
        master.gain.setTargetAtTime(volume / 400, context.currentTime, 0.15);
      }
      if (mounted.current) setEnabled(!enabled);
    } catch {
      void audio.current?.context.close().catch(() => {});
      audio.current = null;
      if (mounted.current) {
        setEnabled(false);
        setError("Audio is unavailable or blocked in this browser. The explorer still works silently.");
      }
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  function changeVolume(value: number) {
    if (!Number.isFinite(value)) return;
    const next = Math.max(0, Math.min(100, value));
    setVolume(next);
    const sound = audio.current;
    if (sound && enabled) sound.master.gain.setTargetAtTime(next / 400, sound.context.currentTime, 0.08);
  }

  function cue(complete = false) {
    const sound = audio.current;
    if (!enabled || !sound || document.hidden || sound.context.state !== "running") return;
    const now = sound.context.currentTime;
    if (now - sound.lastCue < 0.15) return;
    sound.lastCue = now;
    for (const [index, frequency] of (complete ? [523.25, 783.99] : [659.25]).entries()) {
      const oscillator = sound.context.createOscillator();
      const envelope = sound.context.createGain();
      const start = now + index * 0.12;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(0.2, start + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.65);
      oscillator.connect(envelope);
      envelope.connect(sound.master);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(start);
      oscillator.stop(start + 0.7);
    }
  }

  return { enabled, pending, volume, error, toggle, changeVolume, cue };
}
