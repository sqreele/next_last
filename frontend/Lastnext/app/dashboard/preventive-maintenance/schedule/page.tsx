import { Metadata } from 'next';
import { PMScheduleCalendar } from './PMScheduleCalendar';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Preventive Maintenance Calendar',
  description: 'Calendar view of upcoming and recent preventive maintenance work.',
};

export default function PMSchedulePage() {
  return (
    <div className="w-full max-w-none px-3 py-4 sm:px-6 sm:py-5 lg:mx-auto lg:max-w-7xl">
      <PMScheduleCalendar />
    </div>
  );
}
