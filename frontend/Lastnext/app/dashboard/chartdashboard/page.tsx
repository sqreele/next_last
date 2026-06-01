import type { Metadata } from 'next';
import ChartDashboardView from './ChartDashboardView';

export const metadata: Metadata = {
  title: 'Chart Dashboard',
};

export default function ChartDashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="w-full max-w-none px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-[96rem] lg:px-8">
        <ChartDashboardView />
      </div>
    </div>
  );
}
