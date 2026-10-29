import { useSyncExternalStore } from 'react';

const query = '(orientation: landscape)';
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(query);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

/** Whether the screen is wider than it is tall (the phone is held sideways); follows rotation. */
export function useLandscape(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true);
}
