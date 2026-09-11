'use client';

import Link from 'next/link';
import { ArrowRight, Building2, LifeBuoy, MessageCircle } from 'lucide-react';
import { Logo } from '@/app/components/branding/Logo';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { useLocale } from '@/app/lib/i18n/LocaleProvider';
import type { DictKey } from '@/app/lib/i18n/dictionary';

const contactOptions: Array<{
  icon: typeof MessageCircle;
  titleKey: DictKey;
  descriptionKey: DictKey;
  actionKey: DictKey;
  href: string;
}> = [
  {
    icon: MessageCircle,
    titleKey: 'contact.general.title',
    descriptionKey: 'contact.general.description',
    actionKey: 'contact.general.action',
    href: '/',
  },
  {
    icon: LifeBuoy,
    titleKey: 'contact.technical.title',
    descriptionKey: 'contact.technical.description',
    actionKey: 'contact.technical.action',
    href: '/auth/login',
  },
  {
    icon: Building2,
    titleKey: 'contact.sales.title',
    descriptionKey: 'contact.sales.description',
    actionKey: 'contact.sales.action',
    href: '/auth/register',
  },
];

export function ContactPageClient() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--pcms-app-bg)] text-foreground">
      <header className="border-b border-border bg-card/95">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label={t('contact.general.action')}>
            <Logo variant="horizontal" markClassName="size-9" />
          </Link>
          <div
            role="group"
            className="flex items-center gap-1 rounded-lg border border-border bg-background p-1"
            aria-label={t('contact.language')}
          >
            {(['en', 'th'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setLocale(option)}
                aria-pressed={locale === option}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  locale === option
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold text-primary">{t('contact.eyebrow')}</p>
            <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              {t('contact.title')}
            </h1>
            <p className="mt-4 text-lg font-medium text-foreground">
              {t('contact.subtitle')}
            </p>
            <p className="mx-auto mt-5 max-w-2xl text-balance leading-7 text-muted-foreground">
              {t('contact.intro')}
            </p>
          </div>
        </section>

        <section className="border-y border-border bg-card px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3">
            {contactOptions.map((option) => {
              const Icon = option.icon;
              return (
                <Card key={option.titleKey} className="h-full">
                  <CardContent className="flex h-full flex-col p-6">
                    <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <h2 className="mt-5 text-xl font-semibold">{t(option.titleKey)}</h2>
                    <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">
                      {t(option.descriptionKey)}
                    </p>
                    <Button asChild variant="outline" className="mt-6 w-full justify-between">
                      <Link href={option.href}>
                        {t(option.actionKey)}
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="px-4 py-10 sm:px-6 lg:px-8">
          <p className="mx-auto max-w-3xl rounded-xl border border-border bg-muted/50 px-5 py-4 text-center text-sm leading-6 text-muted-foreground">
            {t('contact.notice')}
          </p>
        </section>
      </main>

      <footer className="border-t border-border bg-slate-900 px-4 py-6 text-center text-sm text-slate-400">
        © {new Date().getFullYear()} StayMaint · {t('contact.footer')}
      </footer>
    </div>
  );
}
