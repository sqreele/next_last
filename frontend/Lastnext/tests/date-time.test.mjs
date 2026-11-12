import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  appDateKey, appCalendarDayDifference, formatAppDate, formatAppDateTime,
  formatAppTime, resolveTimeZone,
} from '../app/lib/date-time.mjs';

const instant = '2026-11-12T18:30:00Z';

test('display timezone is independent of the host timezone', () => {
  const script = `import { formatAppDateTime } from './app/lib/date-time.mjs'; console.log(formatAppDateTime('${instant}', 'en-GB', {dateStyle:'short',timeStyle:'short'}));`;
  const outputs = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo'].map((TZ) =>
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: new URL('../', import.meta.url), env: { ...process.env, TZ }, encoding: 'utf8',
    }).trim());
  assert.equal(new Set(outputs).size, 1);
  assert.match(outputs[0], /13\/11\/2026, 01:30/);
});

test('explicit property timezone wins and invalid zones fall back to Bangkok', () => {
  assert.equal(formatAppTime(instant, 'en-GB', {hour:'2-digit', minute:'2-digit', timeZone:'Asia/Tokyo'}), '03:30');
  assert.equal(resolveTimeZone('Invalid/Zone'), 'Asia/Bangkok');
  assert.equal(appDateKey(instant), '2026-11-13');
  assert.equal(appDateKey(instant, 'America/New_York'), '2026-11-12');
});

test('calendar dates remain the same day in all property timezones', () => {
  assert.equal(formatAppDate('2026-11-12', 'en-GB', {timeZone:'America/Los_Angeles'}), '12/11/2026');
  assert.equal(appDateKey('2026-11-12', 'America/Los_Angeles'), '2026-11-12');
});

test('today and yesterday follow calendar boundaries, not elapsed 24 hours', () => {
  assert.equal(appCalendarDayDifference('2026-11-12T16:59:00Z', '2026-11-12T17:01:00Z'), 1);
  assert.equal(appCalendarDayDifference('2026-11-12T17:00:00Z', '2026-11-12T18:30:00Z'), 0);
  assert.equal(appCalendarDayDifference('2026-11-13T17:00:00Z', '2026-11-12T18:30:00Z'), -1);
});

test('invalid timestamps render a placeholder', () => {
  assert.equal(formatAppDateTime('invalid'), '—');
  assert.equal(appDateKey('invalid'), '');
});

test('datetime inputs round-trip in the property timezone, including DST', async () => {
  const { toAppDateTimeInput, appDateTimeInputToISO } = await import('../app/lib/date-time.mjs');
  assert.equal(toAppDateTimeInput(instant), '2026-11-13T01:30');
  assert.equal(appDateTimeInputToISO('2026-11-13T01:30'), instant.replace('Z', '.000Z'));
  assert.equal(appDateTimeInputToISO('2026-07-01T10:00', 'America/New_York'), '2026-07-01T14:00:00.000Z');
  assert.equal(appDateTimeInputToISO('2026-01-01T10:00', 'America/New_York'), '2026-01-01T15:00:00.000Z');
  assert.throws(() => appDateTimeInputToISO('2026-03-08T02:30', 'America/New_York'), RangeError);
});

test('maintenance recurrence preserves wall time across DST and clamps month ends', async () => {
  const { nextAppScheduleDate, toAppDateTimeInput } = await import('../app/lib/date-time.mjs');
  const zone = 'America/New_York';
  const nextDay = nextAppScheduleDate('2026-03-07T15:00:00Z', 'daily', undefined, zone);
  assert.equal(nextDay.toISOString(), '2026-03-08T14:00:00.000Z');
  assert.equal(toAppDateTimeInput(nextDay, zone), '2026-03-08T10:00');
  assert.equal(toAppDateTimeInput(nextAppScheduleDate('2026-01-31T03:00:00Z', 'monthly')), '2026-02-28T10:00');
  assert.equal(toAppDateTimeInput(nextAppScheduleDate('2024-02-29T03:00:00Z', 'annual')), '2025-02-28T10:00');
});
