import { Metadata } from 'next';
import { PMScheduleCalendar } from './PMScheduleCalendar';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Preventive Maintenance Calendar',
  description: 'Calendar view of upcoming and recent preventive maintenance work.',
};

export default function PMSchedulePage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-6">
      <PMScheduleCalendar />
    </div>
  );
}
