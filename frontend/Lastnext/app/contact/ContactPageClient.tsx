'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { AlertCircle, Building2, CheckCircle2, LifeBuoy, Mail, MessageSquare, Send } from 'lucide-react';
import { Logo } from '@/app/components/branding/Logo';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { useLocale } from '@/app/lib/i18n/LocaleProvider';
import type { DictKey } from '@/app/lib/i18n/dictionary';
import {
  CONTACT_CATEGORIES,
  sendContactSubmission,
  validateContactValues,
  type ContactCategory,
  type ContactErrors,
  type ContactField,
  type ContactValues,
} from './contact-form.mjs';

const INITIAL_VALUES: ContactValues = {
  name: '', email: '', company: '', category: 'general', subject: '', message: '', website: '',
};

const categoryKeys: Record<ContactCategory, DictKey> = {
  general: 'contact.category.general',
  product: 'contact.category.product',
  support: 'contact.category.support',
  billing: 'contact.category.billing',
  partnership: 'contact.category.partnership',
  other: 'contact.category.other',
};

const topics: Array<{ icon: typeof LifeBuoy; key: DictKey }> = [
  { icon: MessageSquare, key: 'contact.topic.product' },
  { icon: LifeBuoy, key: 'contact.topic.support' },
  { icon: Building2, key: 'contact.topic.billing' },
  { icon: CheckCircle2, key: 'contact.topic.partnership' },
  { icon: Mail, key: 'contact.topic.general' },
];

const backendFields = new Set<ContactField>([
  'name', 'email', 'company', 'category', 'subject', 'message',
]);

type SubmissionState = 'idle' | 'validating' | 'submitting' | 'success' | 'error';

export function ContactPageClient() {
  const { locale, setLocale, t } = useLocale();
  const [values, setValues] = useState<ContactValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [submissionState, setSubmissionState] = useState<SubmissionState>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const submittingRef = useRef(false);

  const updateField = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const field = event.target.name as ContactField;
    const value = event.target.value;
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    if (submissionState === 'success' || submissionState === 'error') {
      setSubmissionState('idle');
      setStatusMessage('');
    }
  };

  const focusFirstError = (fieldErrors: ContactErrors) => {
    const first = Object.keys(fieldErrors)[0];
    if (first) window.requestAnimationFrame(() => document.getElementById(`contact-${first}`)?.focus());
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;

    setSubmissionState('validating');
    setStatusMessage('');
    const validation = validateContactValues(values, {
      nameMin: t('contact.validation.nameMin'),
      nameMax: t('contact.validation.nameMax'),
      emailRequired: t('contact.validation.emailRequired'),
      emailInvalid: t('contact.validation.emailInvalid'),
      emailMax: t('contact.validation.emailMax'),
      companyMax: t('contact.validation.companyMax'),
      categoryInvalid: t('contact.validation.category'),
      subjectMin: t('contact.validation.subjectMin'),
      subjectMax: t('contact.validation.subjectMax'),
      subjectLines: t('contact.validation.subjectLines'),
      messageMin: t('contact.validation.messageMin'),
      messageMax: t('contact.validation.messageMax'),
    });

    if (Object.keys(validation.errors).length > 0) {
      setErrors(validation.errors);
      setSubmissionState('error');
      setStatusMessage(t('contact.error.validation'));
      focusFirstError(validation.errors);
      return;
    }

    submittingRef.current = true;
    setErrors({});
    setSubmissionState('submitting');

    try {
      const result = await sendContactSubmission(validation.values);
      if (result.status === 201) {
        setValues(INITIAL_VALUES);
        setSubmissionState('success');
        setStatusMessage(t('contact.success'));
        return;
      }

      if (result.status === 400) {
        const fieldErrors: ContactErrors = {};
        if (result.data && typeof result.data === 'object') {
          for (const field of Object.keys(result.data)) {
            if (backendFields.has(field as ContactField)) {
              fieldErrors[field as ContactField] = t('contact.validation.backend');
            }
          }
        }
        setErrors(fieldErrors);
        setStatusMessage(t('contact.error.validation'));
        focusFirstError(fieldErrors);
      } else if (result.status === 413) {
        setStatusMessage(t('contact.error.tooLarge'));
      } else if (result.status === 429) {
        setStatusMessage(t('contact.error.rateLimited'));
      } else if (result.status === 503) {
        setStatusMessage(t('contact.error.server'));
      } else {
        setStatusMessage(t('contact.error.server'));
      }
      setSubmissionState('error');
    } catch {
      setSubmissionState('error');
      setStatusMessage(t('contact.error.network'));
    } finally {
      submittingRef.current = false;
    }
  };

  const fieldError = (field: ContactField) => errors[field];
  const describedBy = (field: ContactField, helpId?: string) =>
    [helpId, fieldError(field) ? `contact-${field}-error` : undefined].filter(Boolean).join(' ') || undefined;
  const isSubmitting = submissionState === 'submitting';

  return (
    <div className="flex min-h-screen flex-col bg-[var(--pcms-app-bg)] text-foreground">
      <header className="border-b border-border bg-card/95">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label={t('contact.homeLabel')}>
            <Logo variant="horizontal" markClassName="size-9" />
          </Link>
          <div role="group" className="flex items-center gap-1 rounded-lg border border-border bg-background p-1" aria-label={t('contact.language')}>
            {(['en', 'th'] as const).map((option) => (
              <button key={option} type="button" onClick={() => setLocale(option)} aria-pressed={locale === option} className={`min-h-9 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${locale === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {option.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="px-4 pb-10 pt-12 text-center sm:px-6 sm:pb-14 sm:pt-16 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <p className="text-sm font-semibold text-primary">{t('contact.eyebrow')}</p>
            <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">{t('contact.title')}</h1>
            <p className="mx-auto mt-5 max-w-2xl text-balance text-base leading-7 text-muted-foreground sm:text-lg">{t('contact.intro')}</p>
          </div>
        </section>

        <section className="border-y border-border bg-card/50 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mx-auto grid max-w-6xl items-start gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-12">
            <aside className="space-y-6 lg:sticky lg:top-8" aria-labelledby="contact-help-title">
              <div>
                <h2 id="contact-help-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('contact.helpTitle')}</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">{t('contact.helpDescription')}</p>
              </div>

              <Card className="border-border shadow-soft">
                <CardContent className="p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Mail className="size-5" aria-hidden="true" /></span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">{t('contact.emailLabel')}</h3>
                      <a href="mailto:support@staymaint.com" className="mt-1 block break-all text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('contact.emailAddress')}</a>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('contact.topicsTitle')}</h3>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {topics.map(({ icon: Icon, key }) => <li key={key} className="flex items-center gap-3 text-sm"><Icon className="size-4 shrink-0 text-primary" aria-hidden="true" /><span>{t(key)}</span></li>)}
                </ul>
              </div>

              <div className="rounded-xl border border-border bg-muted/50 p-5">
                <h3 className="font-semibold">{t('contact.responseTitle')}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('contact.responseDescription')}</p>
              </div>
            </aside>

            <Card className="overflow-hidden border-border shadow-card">
              <CardContent className="p-5 sm:p-7 lg:p-8">
                <h2 className="text-2xl font-semibold tracking-tight">{t('contact.formTitle')}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('contact.formDescription')}</p>

                <form
                  className="mt-7 space-y-5"
                  onSubmit={handleSubmit}
                  noValidate
                  aria-busy={isSubmitting}
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="contact-name">{t('contact.name')}</Label>
                      <Input id="contact-name" name="name" autoComplete="name" required minLength={2} maxLength={120} placeholder={t('contact.namePlaceholder')} value={values.name} onChange={updateField} aria-invalid={Boolean(fieldError('name'))} aria-describedby={describedBy('name')} />
                      {fieldError('name') && <p id="contact-name-error" className="flex items-start gap-1.5 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{fieldError('name')}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-email">{t('contact.email')}</Label>
                      <Input id="contact-email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} placeholder={t('contact.emailPlaceholder')} value={values.email} onChange={updateField} aria-invalid={Boolean(fieldError('email'))} aria-describedby={describedBy('email')} />
                      {fieldError('email') && <p id="contact-email-error" className="flex items-start gap-1.5 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{fieldError('email')}</p>}
                    </div>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="contact-company">{t('contact.company')}</Label>
                      <Input id="contact-company" name="company" autoComplete="organization" maxLength={160} placeholder={t('contact.companyPlaceholder')} value={values.company} onChange={updateField} aria-invalid={Boolean(fieldError('company'))} aria-describedby={describedBy('company')} />
                      {fieldError('company') && <p id="contact-company-error" className="flex items-start gap-1.5 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{fieldError('company')}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-category">{t('contact.category')}</Label>
                      <select id="contact-category" name="category" required value={values.category} onChange={updateField} aria-invalid={Boolean(fieldError('category'))} aria-describedby={describedBy('category')} className="h-11 w-full rounded-md border border-input bg-background px-3.5 text-sm text-foreground shadow-soft transition-[border-color,box-shadow] hover:border-foreground/30 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 aria-[invalid=true]:border-destructive">
                        {(CONTACT_CATEGORIES as ContactCategory[]).map((category) => <option key={category} value={category}>{t(categoryKeys[category])}</option>)}
                      </select>
                      {fieldError('category') && <p id="contact-category-error" className="flex items-start gap-1.5 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{fieldError('category')}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contact-subject">{t('contact.subject')}</Label>
                    <Input id="contact-subject" name="subject" required minLength={3} maxLength={160} placeholder={t('contact.subjectPlaceholder')} value={values.subject} onChange={updateField} aria-invalid={Boolean(fieldError('subject'))} aria-describedby={describedBy('subject')} />
                    {fieldError('subject') && <p id="contact-subject-error" className="flex items-start gap-1.5 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{fieldError('subject')}</p>}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-end justify-between gap-3">
                      <Label htmlFor="contact-message">{t('contact.message')}</Label>
                      <span id="contact-message-count" className="shrink-0 text-xs text-muted-foreground">{t('contact.messageCount', { count: values.message.length })}</span>
                    </div>
                    <Textarea id="contact-message" name="message" required minLength={20} maxLength={5000} rows={7} placeholder={t('contact.messagePlaceholder')} value={values.message} onChange={updateField} aria-invalid={Boolean(fieldError('message'))} aria-describedby={describedBy('message', 'contact-message-count')} className="min-h-40 resize-y text-base sm:text-sm" />
                    {fieldError('message') && <p id="contact-message-error" className="flex items-start gap-1.5 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{fieldError('message')}</p>}
                  </div>

                  <div className="pointer-events-none absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                    <label htmlFor="contact-website">Website</label>
                    <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={values.website} onChange={updateField} />
                  </div>

                  <div aria-live={submissionState === 'error' ? 'assertive' : 'polite'} aria-atomic="true">
                    {statusMessage && (
                      <Alert
                        role={submissionState === 'error' ? 'alert' : 'status'}
                        variant={submissionState === 'error' ? 'destructive' : 'default'}
                        className={submissionState === 'success' ? 'border-success/40 bg-success/10 text-foreground [&>svg]:text-success' : undefined}
                      >
                        {submissionState === 'success' ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <AlertCircle className="size-4" aria-hidden="true" />}
                        <p className="mb-1 font-medium leading-none tracking-tight">
                          {t(submissionState === 'success' ? 'contact.successTitle' : 'contact.errorTitle')}
                        </p>
                        <AlertDescription>{statusMessage}</AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <Button type="submit" size="lg" className="w-full sm:w-auto sm:min-w-44" disabled={isSubmitting} isLoading={isSubmitting} loadingText={t('contact.submitting')}>
                    <Send className="size-4" aria-hidden="true" />
                    {t('contact.submit')}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-slate-900 px-4 py-6 text-center text-sm text-slate-400">
        © {new Date().getFullYear()} StayMaint · {t('contact.footer')}
      </footer>
    </div>
  );
}
