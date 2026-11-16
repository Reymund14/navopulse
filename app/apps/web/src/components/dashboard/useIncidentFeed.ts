"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

export interface LiveEvent {
  op: "INSERT" | "UPDATE";
  id: string;
  module: string;
  status: string;
  priority: string;
  controlNumber: string;
  at: number;
}

/** Two-tone alert generated with WebAudio (no audio file needed). */
function beep() {
  try {
    const ctx = new AudioContext();
    [880, 660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.18);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.15);
    });
  } catch {
    /* audio blocked until user interaction */
  }
}

/**
 * Subscribes to the incident SSE stream, refreshes incident queries on every
 * change, and raises an audible + visual alert for new emergency reports.
 */
export function useIncidentFeed(soundOn: boolean) {
  const qc = useQueryClient();
  const [alerts, setAlerts] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const sound = useRef(soundOn);
  useEffect(() => {
    sound.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    const es = new EventSource("/api/incidents/stream");
    let timer: ReturnType<typeof setTimeout> | null = null;
    es.addEventListener("ready", () => setConnected(true));
    es.onerror = () => setConnected(false);
    es.addEventListener("incident", (e) => {
      const evt = { ...(JSON.parse((e as MessageEvent).data) as Omit<LiveEvent, "at">), at: Date.now() };
      // Debounce refetches during bursts (e.g. bulk SMS during a storm).
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["incidents"] });
      }, 400);
      void qc.invalidateQueries({ queryKey: ["incident", evt.id] });
      if (evt.op === "INSERT") {
        setAlerts((a) => [evt, ...a].slice(0, 5));
        if (evt.module === "emergency" && sound.current) beep();
      }
    });
    return () => {
      es.close();
      if (timer) clearTimeout(timer);
    };
  }, [qc]);

  return { alerts, dismiss: (id: string) => setAlerts((a) => a.filter((x) => x.id !== id)), connected };
}
