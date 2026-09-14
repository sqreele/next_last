"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePlatformAccess } from "@/app/lib/hooks/usePlatformAccess";
import { platformNavigationItems } from "@/app/lib/platform-navigation.mjs";

export function PlatformNavigation() {
  const pathname = usePathname();
  const { canAccessPlatform, isPlatformAccessLoading } = usePlatformAccess();
  if (isPlatformAccessLoading) return null;
  return (
    <nav aria-label="Platform navigation" className="flex flex-wrap gap-2 border-b pb-4">
      {platformNavigationItems.filter((item) => canAccessPlatform(item.capability)).map((item) => (
        <Link key={item.href} href={item.href}
          className={`rounded-md px-3 py-2 text-sm font-medium ${pathname === item.href ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
