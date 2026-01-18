import type { Metadata } from 'next';
import UtilityConsumptionView from './UtilityConsumptionView';

export const metadata: Metadata = {
  title: 'Utility Consumption',
};

export default function UtilityConsumptionPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <UtilityConsumptionView />
      </div>
    </div>
  );
}
