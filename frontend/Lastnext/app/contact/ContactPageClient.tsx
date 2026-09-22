'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CircleHelp,
  FileWarning,
  LifeBuoy,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
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

const beforeYouContact: Array<{
  icon: typeof CircleHelp;
  titleKey: DictKey;
  descriptionKey: DictKey;
}> = [
  {
    icon: FileWarning,
    titleKey: 'contact.before.correction.title',
    descriptionKey: 'contact.before.correction.description',
  },
  {
    icon: LifeBuoy,
    titleKey: 'contact.before.technical.title',
    descriptionKey: 'contact.before.technical.description',
  },
  {
    icon: Building2,
    titleKey: 'contact.before.partnership.title',
    descriptionKey: 'contact.before.partnership.description',
  },
];

const contactInformation: Array<{ titleKey: DictKey; descriptionKey: DictKey }> = [
  { titleKey: 'contact.info.general.title', descriptionKey: 'contact.info.general.description' },
  { titleKey: 'contact.info.corrections.title', descriptionKey: 'contact.info.corrections.description' },
  { titleKey: 'contact.info.privacy.title', descriptionKey: 'contact.info.privacy.description' },
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
        <section className="border-b border-border px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm font-semibold text-primary">{t('contact.hero.eyebrow')}</p>
            <h1 className="mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              {t('contact.hero.title')}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              {t('contact.hero.description')}
            </p>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm font-medium text-foreground" aria-label={t('contact.hero.supportLabel')}>
              {(['contact.hero.general', 'contact.hero.corrections', 'contact.hero.privacy'] as const).map((key) => (
                <li key={key} className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)] lg:gap-12">
            <section aria-labelledby="contact-options-heading">
              <div className="max-w-2xl">
                <h2 id="contact-options-heading" className="text-2xl font-semibold tracking-tight">
                  {t('contact.main.title')}
                </h2>
                <p className="mt-2 leading-7 text-muted-foreground">{t('contact.main.description')}</p>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {contactOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <Card key={option.titleKey} className="h-full shadow-none">
                      <CardContent className="flex h-full flex-col p-5">
                        <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="size-5" aria-hidden="true" />
                        </span>
                        <h3 className="mt-4 text-lg font-semibold">{t(option.titleKey)}</h3>
                        <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                          {t(option.descriptionKey)}
                        </p>
                        <Button asChild variant="outline" className="mt-5 w-full justify-between">
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

            <aside aria-labelledby="contact-information-heading" className="rounded-lg border border-border bg-muted/40 p-5 sm:p-6">
              <div className="flex size-10 items-center justify-center rounded-lg bg-card text-primary shadow-soft">
                <LockKeyhole className="size-5" aria-hidden="true" />
              </div>
              <h2 id="contact-information-heading" className="mt-4 text-xl font-semibold">
                {t('contact.info.title')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('contact.info.intro')}</p>
              <dl className="mt-6 space-y-5">
                {contactInformation.map((item) => (
                  <div key={item.titleKey}>
                    <dt className="text-sm font-semibold text-foreground">{t(item.titleKey)}</dt>
                    <dd className="mt-1 text-sm leading-6 text-muted-foreground">{t(item.descriptionKey)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 border-t border-border pt-5 text-sm leading-6 text-muted-foreground">
                {t('contact.info.response')}
              </p>
            </aside>
          </div>
        </section>

        <section className="border-t border-border bg-card px-4 py-10 sm:px-6 sm:py-14 lg:px-8" aria-labelledby="contact-before-heading">
          <div className="mx-auto max-w-6xl">
            <h2 id="contact-before-heading" className="text-2xl font-semibold tracking-tight">{t('contact.before.title')}</h2>
            <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">{t('contact.before.description')}</p>
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              {beforeYouContact.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.titleKey} className="border-l-2 border-primary/30 pl-4">
                    <Icon className="size-5 text-primary" aria-hidden="true" />
                    <h3 className="mt-3 font-semibold">{t(item.titleKey)}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{t(item.descriptionKey)}</p>
                  </div>
                );
              })}
            </div>
            <p className="mt-8 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm leading-6 text-muted-foreground sm:px-5">
              {t('contact.notice')}
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-slate-900 px-4 py-6 text-center text-sm text-slate-400">
        © {new Date().getFullYear()} StayMaint · {t('contact.footer')}
      </footer>
    </div>
  );
}
