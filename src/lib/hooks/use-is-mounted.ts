"use client";

/**
 * useIsMounted — returns `false` during SSR and the initial client
 * hydration render, then `true` afterwards. This is the safe pattern
 * for rendering client-only content (e.g. animated symbols, theme
 * toggles) without triggering hydration mismatches.
 *
 * Implemented via `useSyncExternalStore` (no `setState` in effect,
 * so it satisfies `react-hooks/set-state-in-effect`).
 */
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function useIsMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot
  );
}
