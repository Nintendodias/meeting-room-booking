"use client";

import { useSyncExternalStore } from "react";
import { getLocalNow, type LocalNow } from "@/lib/time";

const TICK_MS = 15_000;

let cached: LocalNow | null = null;

function getSnapshot(): LocalNow {
  const next = getLocalNow();
  if (!cached || cached.date !== next.date || cached.minutes !== next.minutes) {
    cached = next;
  }
  return cached;
}

function subscribe(onChange: () => void): () => void {
  const interval = window.setInterval(onChange, TICK_MS);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onChange);
  };
}

const getServerSnapshot = (): null => null;

/** The user's local date and minute, refreshed while the page is open; null during SSR. */
export function useLocalNow(): LocalNow | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
