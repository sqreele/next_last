import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  ArrowRight,
  Users as UsersIcon,
  DoorOpen,
} from "lucide-react";
import { getServerSession } from "@/app/lib/session.server";
import { fetchProperties } from "@/app/lib/data.server";
import { Skeleton } from "@/app/components/ui/loading";
import { PropertiesToolbar } from "./PropertiesToolbar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Properties",
  description: "Manage hotel properties and onboard new ones in bulk.",
};

export default async function PropertiesIndexPage() {
  const session = await getServerSession();
  const accessToken = session?.user?.accessToken;
  const properties = (await fetchProperties(accessToken).catch(() => [])) || [];

  return (
    <div className="w-full max-w-none space-y-5 px-3 py-3 sm:px-4 md:px-5 lg:mx-auto lg:max-w-7xl">
      <header className="pcms-page-header">
        <div>
          <p className="pcms-eyebrow">Properties workspace</p>
          <h1>Properties</h1>
          <p className="pcms-page-description">
            {properties.length} propert{properties.length === 1 ? "y" : "ies"}{" "}
            in scope
          </p>
        </div>
        <PropertiesToolbar />
      </header>

      <Suspense
        fallback={
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
        }
      >
        {properties.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--pcms-border-strong)] bg-[var(--pcms-surface-soft)] p-8 text-center">
            <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-bold text-foreground">
              No properties yet.
            </p>
            <p className="text-xs font-medium text-muted-foreground">
              Use Import CSV (staff only) to onboard your portfolio in one shot.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((prop: any) => (
              <li key={prop.property_id ?? prop.id}>
                <Link
                  href={`/dashboard/rooms?property=${encodeURIComponent(prop.property_id ?? prop.id)}`}
                  className="flex h-full flex-col gap-2 rounded-xl border border-[var(--pcms-border)] bg-card p-4 shadow-[var(--pcms-shadow-soft)] transition-all hover:border-[var(--pcms-border-strong)] hover:shadow-[var(--pcms-shadow)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground line-clamp-1">
                        {prop.name}
                      </p>
                      <p className="text-xs font-medium text-muted-foreground">
                        #{prop.property_id || prop.id}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 flex-none text-muted-foreground" />
                  </div>
                  {prop.description && (
                    <p className="text-xs font-medium text-muted-foreground line-clamp-2">
                      {prop.description}
                    </p>
                  )}
                  <div className="mt-auto flex items-center gap-3 text-[11px] font-semibold text-muted-foreground">
                    {typeof prop.room_count === "number" && (
                      <span className="inline-flex items-center gap-1">
                        <DoorOpen className="h-3 w-3" /> {prop.room_count} rooms
                      </span>
                    )}
                    {typeof prop.user_count === "number" && (
                      <span className="inline-flex items-center gap-1">
                        <UsersIcon className="h-3 w-3" /> {prop.user_count}{" "}
                        users
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Suspense>
    </div>
  );
}
