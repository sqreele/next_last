/**
 * Request-token state machine used by useMinLoaderTime.
 *
 * The injected clock functions keep the behavior deterministic in tests while
 * production callers use the browser's Date/setTimeout/clearTimeout defaults.
 */
export function createMinLoaderController({
  hide,
  minDuration,
  now = () => Date.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (timer) => clearTimeout(timer),
}) {
  let active = true;
  let generation = 0;
  let shownAt = null;
  let timer = null;

  const clearTimer = () => {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
  };

  return {
    mount() {
      active = true;
    },

    start() {
      generation += 1;
      clearTimer();
      shownAt = now();
      return generation;
    },

    finish(token) {
      if (!active || token !== generation) return;

      const startedAt = shownAt;
      if (startedAt === null) return;
      shownAt = null;
      clearTimer();

      const remaining = Math.max(
        0,
        minDuration - (now() - startedAt),
      );
      if (remaining === 0) {
        hide();
        return;
      }

      timer = schedule(() => {
        timer = null;
        if (active && token === generation) hide();
      }, remaining);
    },

    dispose() {
      active = false;
      generation += 1;
      shownAt = null;
      clearTimer();
    },
  };
}
