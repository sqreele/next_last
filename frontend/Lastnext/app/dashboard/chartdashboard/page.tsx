import type { Metadata } from 'next';
import ChartDashboardView from './ChartDashboardView';

export const metadata: Metadata = {
  title: 'Chart Dashboard',
};

export default function ChartDashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <ChartDashboardView />
      </div>
    </div>
  );
}
