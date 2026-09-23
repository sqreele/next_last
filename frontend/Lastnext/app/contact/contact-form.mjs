export const CONTACT_ENDPOINT = '/api/contact/';

export const CONTACT_CATEGORIES = [
  'general',
  'product',
  'support',
  'billing',
  'partnership',
  'other',
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeContactValues(values) {
  return {
    name: values.name.trim(),
    email: values.email.trim(),
    company: values.company.trim(),
    category: values.category,
    subject: values.subject.trim(),
    message: values.message.trim(),
    website: values.website.trim(),
  };
}

export function validateContactValues(values, messages) {
  const normalized = normalizeContactValues(values);
  const errors = {};

  if (normalized.name.length < 2) errors.name = messages.nameMin;
  else if (normalized.name.length > 120) errors.name = messages.nameMax;

  if (!normalized.email) errors.email = messages.emailRequired;
  else if (normalized.email.length > 254) errors.email = messages.emailMax;
  else if (!EMAIL_PATTERN.test(normalized.email)) errors.email = messages.emailInvalid;

  if (normalized.company.length > 160) errors.company = messages.companyMax;

  if (!CONTACT_CATEGORIES.includes(normalized.category)) {
    errors.category = messages.categoryInvalid;
  }

  if (normalized.subject.length < 3) errors.subject = messages.subjectMin;
  else if (normalized.subject.length > 160) errors.subject = messages.subjectMax;
  else if (/\r|\n/.test(normalized.subject)) errors.subject = messages.subjectLines;

  if (normalized.message.length < 20) errors.message = messages.messageMin;
  else if (normalized.message.length > 5000) errors.message = messages.messageMax;

  return { errors, values: normalized };
}

export async function sendContactSubmission(values, fetchImplementation = fetch) {
  const response = await fetchImplementation(CONTACT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(normalizeContactValues(values)),
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // Status-based UI remains useful if an intermediary returns a non-JSON body.
  }
  return { status: response.status, data };
}
