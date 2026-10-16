import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BotMessageSquare, Clock3, Sparkles } from "lucide-react";
import AiChatDesktopNav from "@/app/components/ai/AiChatDesktopNav";
import AiChatMobileMenu from "@/app/components/ai/AiChatMobileMenu";

export const metadata: Metadata = {
  title: "AI Assistant — Coming Soon | StayMaint",
  description: "The StayMaint AI Assistant is coming soon.",
  robots: { index: false, follow: false },
};

export default function AiChatPage() {
  return (
    <main className="flex min-h-screen bg-slate-100">
      <AiChatDesktopNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <AiChatMobileMenu />
        <section className="relative flex min-h-[calc(100vh-4rem)] flex-1 items-center justify-center overflow-hidden px-5 py-16 pb-28 md:min-h-screen md:px-8 md:py-12 md:pb-12">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.16),transparent_38%)]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.16)_1px,transparent_1px)] [background-size:32px_32px]"
          />

          <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/80 bg-white/85 px-6 py-12 text-center shadow-[0_28px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:px-12 sm:py-16">
            <div className="absolute right-6 top-6 text-sky-200" aria-hidden="true">
              <Sparkles className="h-8 w-8" />
            </div>

            <div className="mx-auto mb-7 flex h-20 w-20 items-center justify-center rounded-3xl bg-linear-to-br from-blue-600 to-sky-400 text-white shadow-lg shadow-blue-500/25">
              <BotMessageSquare className="h-10 w-10" aria-hidden="true" />
            </div>

            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              Coming soon
            </div>

            <h1 className="text-balance text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
              AI Assistant is on the way
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-pretty text-base leading-7 text-slate-600 sm:text-lg">
              We&apos;re building a smarter way to get maintenance answers,
              summarize work, and help your team move faster—all in one place.
            </p>

            <Link
              href="/dashboard"
              className="mt-9 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to dashboard
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
