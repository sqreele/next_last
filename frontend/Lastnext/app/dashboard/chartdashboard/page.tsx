import type { Metadata } from 'next';
import ChartDashboardView from './ChartDashboardView';

export const metadata: Metadata = {
  title: 'Chart Dashboard',
};

export default function ChartDashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-[96rem] flex-col px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
        <ChartDashboardView />
      </div>
    </div>
  );
}
