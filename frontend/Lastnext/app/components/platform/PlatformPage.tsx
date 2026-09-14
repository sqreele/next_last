import { PlatformNavigation } from "./PlatformNavigation";

export function PlatformPage({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold tracking-wider text-muted-foreground">PLATFORM OPERATIONS</p><h1 className="text-2xl font-bold">{title}</h1></div>
      <span className="rounded-full border border-amber-500/40 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">READ ONLY</span>
    </div>
    <PlatformNavigation />
    {children}
  </main>;
}
