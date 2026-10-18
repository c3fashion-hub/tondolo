"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Reading aloud with the phone's own built-in voice (the Web Speech API). Nothing leaves the phone
// and there's no speech supplier. Sentence by sentence, so the screen can follow along.
export function useSpeech() {
  const [supported, setSupported] = useState(true);
  const [state, setState] = useState<"idle" | "speaking" | "paused">("idle");
  const [index, setIndex] = useState(-1);
  const queue = useRef<string[]>([]);
  const run = useRef(0);

  useEffect(() => {
    const ok = typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
    setSupported(ok);
    if (ok) window.speechSynthesis.getVoices(); // some phones load voices on first ask
    return () => { if (ok) window.speechSynthesis.cancel(); };
  }, []);

  const voice = () => {
    const voices = window.speechSynthesis.getVoices();
    return voices.find((v) => v.lang === "en-GB" && v.localService) ?? voices.find((v) => v.lang === "en-GB") ?? voices.find((v) => v.lang?.startsWith("en")) ?? null;
  };

  const speakFrom = useCallback((i: number, id: number) => {
    if (id !== run.current) return;
    if (i >= queue.current.length) { setState("idle"); setIndex(-1); return; }
    const u = new SpeechSynthesisUtterance(queue.current[i]);
    u.lang = "en-GB";
    const v = voice();
    if (v) u.voice = v;
    u.rate = 0.95;
    u.onend = () => speakFrom(i + 1, id);
    u.onerror = (e) => { if (e.error !== "interrupted" && e.error !== "canceled") speakFrom(i + 1, id); };
    setIndex(i);
    window.speechSynthesis.speak(u);
  }, []);

  const play = useCallback((sentences: string[]) => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    queue.current = sentences;
    const id = ++run.current;
    setState("speaking");
    speakFrom(0, id);
  }, [supported, speakFrom]);

  const pause = useCallback(() => { window.speechSynthesis.pause(); setState("paused"); }, []);
  const resume = useCallback(() => { window.speechSynthesis.resume(); setState("speaking"); }, []);
  const stop = useCallback(() => { run.current++; window.speechSynthesis.cancel(); setState("idle"); setIndex(-1); }, []);

  return { supported, state, index, play, pause, resume, stop };
}
