/** Display instants in the property's timezone, independent of browser/server settings. */
export const DEFAULT_APP_TIME_ZONE = 'Asia/Bangkok';

export function resolveTimeZone(value) {
  if (typeof value !== 'string' || !value) return DEFAULT_APP_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return value;
  } catch {
    return DEFAULT_APP_TIME_ZONE;
  }
}

function displayDate(value, locales, options, kind) {
  // A date without a time is a calendar date, not a UTC instant.
  const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = value instanceof Date ? value : new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '—';
  const resolved = {
    ...options,
    timeZone: dateOnly ? 'UTC' : resolveTimeZone(options?.timeZone),
  };
  return date[kind](locales ?? 'en-GB', resolved);
}

export function formatAppDate(value, locales, options) {
  return displayDate(value, locales, options, 'toLocaleDateString');
}

export function formatAppDateTime(value, locales, options) {
  return displayDate(value, locales, options, 'toLocaleString');
}

export function formatAppTime(value, locales, options) {
  return displayDate(value, locales, options, 'toLocaleTimeString');
}

export function appDateKey(value = new Date(), timeZone = DEFAULT_APP_TIME_ZONE) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: resolveTimeZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function appCalendarDayDifference(value, now = new Date(), timeZone = DEFAULT_APP_TIME_ZONE) {
  const date = appDateKey(value, timeZone);
  const today = appDateKey(now, timeZone);
  return date && today ? Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000) : NaN;
}

export function toAppDateTimeInput(value, timeZone = DEFAULT_APP_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: resolveTimeZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

/** Convert a property's wall-clock input to an unambiguous API instant. */
export function appDateTimeInputToISO(value, timeZone = DEFAULT_APP_TIME_ZONE) {
  if (!value) return '';
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new RangeError('Invalid date and time');
    return date.toISOString();
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new RangeError('Invalid date and time');
  const target = Date.parse(`${value}:00Z`);
  let candidate = target;
  for (let i = 0; i < 4; i++) {
    const displayed = toAppDateTimeInput(candidate, timeZone);
    if (displayed === value) return new Date(candidate).toISOString();
    candidate += target - Date.parse(`${displayed}:00Z`);
  }
  throw new RangeError('This local time does not exist in the selected timezone');
}

/** Calendar-only Date for date-fns comparisons and calendar controls; never send as an instant. */
export function appCalendarDate(value = new Date(), timeZone = DEFAULT_APP_TIME_ZONE) {
  const key = appDateKey(value, timeZone);
  if (!key) return new Date(NaN);
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function nextAppScheduleDate(value, frequency, customDays, timeZone = DEFAULT_APP_TIME_ZONE) {
  // Do calendar arithmetic on wall-clock fields, so a browser in another timezone
  // or a DST transition cannot shift the intended maintenance time.
  const wall = new Date(`${toAppDateTimeInput(value, timeZone)}:00Z`);
  const day = wall.getUTCDate();
  if (frequency === 'daily' || frequency === 'weekly' || (frequency === 'custom' && customDays > 0)) {
    wall.setUTCDate(day + (frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : customDays));
  } else {
    const months = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }[frequency] ?? 1;
    wall.setUTCDate(1);
    wall.setUTCMonth(wall.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() + 1, 0)).getUTCDate();
    wall.setUTCDate(Math.min(day, lastDay));
  }
  return new Date(appDateTimeInputToISO(wall.toISOString().slice(0, 16), timeZone));
}
