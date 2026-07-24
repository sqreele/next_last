import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  ClipboardCheck,
  Clock3,
  Hotel,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import {
  MarketingPage,
  relatedMarketingLinks,
} from "@/app/lib/marketing-pages";

const benefitIcons = [Clock3, ShieldCheck, BarChart3];

export function SeoLandingPage({ page }: { page: MarketingPage }) {
  const isThai = page.locale === "th";
  const path = `${isThai ? "/th/" : "/"}${page.slug}`;
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <div className="min-h-screen bg-[var(--pcms-app-bg)] text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <header className="sticky top-0 z-50 border-b border-border bg-card/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Hotel className="h-5 w-5" aria-hidden />
            </span>
            HotelCare Pro
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="hidden sm:inline-flex"
            >
              <Link href="/auth/login">
                {isThai ? "เข้าสู่ระบบ" : "Sign in"}
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth/register">
                {isThai ? "เริ่มใช้งาน" : "Get started"}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-5xl text-center">
            <p className="mb-4 text-sm font-semibold text-primary">
              {page.eyebrow}
            </p>
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              {page.title}
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-balance text-lg leading-8 text-muted-foreground">
              {page.description}
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/auth/register">
                  {isThai
                    ? "ทดลองใช้ HotelCare Pro"
                    : "Start with HotelCare Pro"}
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="#how-it-works">
                  {isThai ? "ดูขั้นตอนการทำงาน" : "See how it works"}
                </Link>
              </Button>
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              {isThai
                ? "ออกแบบสำหรับมือถือ • รองรับหลายโรงแรม • เริ่มต้นได้โดยไม่ซับซ้อน"
                : "Mobile-first • Multi-property ready • Designed for hotel teams"}
            </p>
          </div>
        </section>

        <section className="border-y border-border bg-card px-4 py-14 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
            {page.benefits.map((benefit, index) => {
              const Icon = benefitIcons[index] ?? Wrench;
              return (
                <Card key={benefit.title}>
                  <CardContent className="p-5 sm:p-6">
                    <span className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <h2 className="text-lg font-semibold">{benefit.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {benefit.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section
          id="how-it-works"
          className="scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
        >
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-sm font-semibold text-primary">
                {isThai ? "ขั้นตอนการทำงาน" : "A predictable workflow"}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                {isThai
                  ? "จากปัญหาหน้างานสู่ข้อมูลที่นำไปใช้ได้"
                  : "From reported issue to reliable history"}
              </h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                {isThai
                  ? "ทีมเห็นเฉพาะข้อมูลที่จำเป็นในแต่ละขั้นตอน ขณะที่รายละเอียดและประวัติยังค้นหาได้เมื่อต้องการ"
                  : "Progressive disclosure keeps daily work readable while the complete operational record remains available when needed."}
              </p>
            </div>
            <ol className="grid gap-3">
              {page.workflow.map((step, index) => (
                <li
                  key={step}
                  className="flex gap-4 rounded-xl border border-border bg-card p-4 shadow-soft"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <p className="pt-1 text-sm leading-6 sm:text-base">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-muted/50 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <ClipboardCheck className="h-7 w-7 text-primary" aria-hidden />
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                {page.featureTitle}
              </h2>
            </div>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {page.features.map((feature) => (
                <li
                  key={feature}
                  className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card p-4"
                >
                  <Check
                    className="h-5 w-5 shrink-0 text-primary"
                    aria-hidden
                  />
                  <span className="font-medium">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-3xl font-semibold tracking-tight">
              {isThai ? "คำถามที่พบบ่อย" : "Frequently asked questions"}
            </h2>
            <div className="mt-8 divide-y divide-border border-y border-border">
              {page.faq.map((item) => (
                <details key={item.question} className="group py-5">
                  <summary className="cursor-pointer list-none pr-8 font-semibold marker:hidden">
                    {item.question}
                  </summary>
                  <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8">
          <div className="mx-auto max-w-7xl rounded-xl bg-foreground px-6 py-10 text-background sm:px-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold">
                  {isThai
                    ? "ยกระดับงานซ่อมบำรุงโรงแรมของคุณ"
                    : "Run calmer, more accountable hotel maintenance"}
                </h2>
                <p className="mt-2 text-sm text-background/70">
                  {isThai
                    ? "รวมทีม งาน และประวัติการซ่อมไว้ใน HotelCare Pro"
                    : "Bring your team, work orders and maintenance history into HotelCare Pro."}
                </p>
              </div>
              <Button variant="secondary" size="lg" asChild>
                <Link href="/auth/register">
                  {isThai ? "เริ่มใช้งาน" : "Get started"}
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <nav
          aria-label={isThai ? "หน้าที่เกี่ยวข้อง" : "Related solutions"}
          className="border-t border-border bg-card px-4 py-10 sm:px-6 lg:px-8"
        >
          <div className="mx-auto max-w-7xl">
            <p className="mb-4 text-sm font-semibold">
              {isThai ? "เนื้อหาที่เกี่ยวข้อง" : "Explore related solutions"}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
              {relatedMarketingLinks
                .filter((link) => link.href !== path)
                .map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {link.label}
                  </Link>
                ))}
            </div>
          </div>
        </nav>
      </main>
    </div>
  );
}
