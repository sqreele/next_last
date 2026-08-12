'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMainStore } from '@/app/lib/stores/mainStore';
import {
  getAuthorizedDashboardPath,
  getDefaultAuthorizedPropertyId,
  isPropertyAllowedForUser,
  userHasPropertyRestrictions,
} from '@/app/lib/security/propertyAccess';

function getPropertyIdFromRoute(pathname: string, searchParams: URLSearchParams): string | null {
  const queryPropertyId = searchParams.get('property_id') || searchParams.get('propertyId');
  if (queryPropertyId) return queryPropertyId;

  const segments = pathname.split('/').filter(Boolean);
  const propertySegmentIndex = segments.findIndex((segment) => segment === 'properties' || segment === 'property');
  if (propertySegmentIndex >= 0 && segments[propertySegmentIndex + 1]) {
    return decodeURIComponent(segments[propertySegmentIndex + 1]);
  }

  if (segments[0] === 'report' && segments[1]) {
    return decodeURIComponent(segments[1]);
  }

  return null;
}

export function PropertyAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userProfile = useMainStore((state) => state.userProfile);
  const selectedPropertyId = useMainStore((state) => state.selectedPropertyId);
  const setSelectedPropertyId = useMainStore((state) => state.setSelectedPropertyId);

  const requestedPropertyId = useMemo(
    () => getPropertyIdFromRoute(pathname, searchParams),
    [pathname, searchParams],
  );
  const appliedRoutePropertyIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userProfile || !userHasPropertyRestrictions(userProfile)) return;

    const fallbackPropertyId = getDefaultAuthorizedPropertyId(userProfile);

    if (selectedPropertyId && !isPropertyAllowedForUser(userProfile, selectedPropertyId)) {
      setSelectedPropertyId(fallbackPropertyId);
    }
  }, [selectedPropertyId, setSelectedPropertyId, userProfile]);

  useEffect(() => {
    if (!userProfile || !userHasPropertyRestrictions(userProfile)) {
      appliedRoutePropertyIdRef.current = requestedPropertyId;
      return;
    }

    if (!requestedPropertyId) {
      appliedRoutePropertyIdRef.current = null;
      return;
    }

    if (!isPropertyAllowedForUser(userProfile, requestedPropertyId)) {
      router.replace(getAuthorizedDashboardPath(userProfile));
      return;
    }

    if (appliedRoutePropertyIdRef.current !== requestedPropertyId) {
      appliedRoutePropertyIdRef.current = requestedPropertyId;
      setSelectedPropertyId(requestedPropertyId);
    }
  }, [requestedPropertyId, router, setSelectedPropertyId, userProfile]);

  return <>{children}</>;
}
