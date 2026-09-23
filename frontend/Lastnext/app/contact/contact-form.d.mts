export const CONTACT_ENDPOINT: '/api/contact/';
export const CONTACT_CATEGORIES: readonly string[];

export type ContactCategory = 'general' | 'product' | 'support' | 'billing' | 'partnership' | 'other';

export interface ContactValues {
  name: string;
  email: string;
  company: string;
  category: ContactCategory;
  subject: string;
  message: string;
  website: string;
}

export type ContactField = keyof ContactValues;
export type ContactErrors = Partial<Record<ContactField, string>>;

export interface ContactValidationMessages {
  nameMin: string;
  nameMax: string;
  emailRequired: string;
  emailMax: string;
  emailInvalid: string;
  companyMax: string;
  categoryInvalid: string;
  subjectMin: string;
  subjectMax: string;
  subjectLines: string;
  messageMin: string;
  messageMax: string;
}

export function normalizeContactValues(values: ContactValues): ContactValues;
export function validateContactValues(
  values: ContactValues,
  messages: ContactValidationMessages,
): { errors: ContactErrors; values: ContactValues };
export function sendContactSubmission(
  values: ContactValues,
  fetchImplementation?: typeof fetch,
): Promise<{ status: number; data: unknown }>;
