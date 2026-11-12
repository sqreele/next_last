'use client';

import { useSyncExternalStore } from 'react';
import { useMainStore } from '@/app/lib/stores/mainStore';
import { DEFAULT_APP_TIME_ZONE, resolveTimeZone } from '@/app/lib/date-time.mjs';

function getSnapshot() {
  const state = useMainStore.getState();
  const property = state.properties.find(
    (item) => String(item.property_id || item.id) === String(state.selectedPropertyId),
  );
  const detail = state.selectedPropertyData;
  return resolveTimeZone(property?.timezone || (
    detail && String(detail.property_id || detail.id) === String(state.selectedPropertyId)
      ? detail.timezone : undefined
  ));
}

// Use the same initial timezone on the server and during hydration. Then subscribe
// to the active property so switching hotels also updates every displayed time.
export function useAppTimeZone() {
  return useSyncExternalStore(useMainStore.subscribe, getSnapshot, () => DEFAULT_APP_TIME_ZONE);
}
