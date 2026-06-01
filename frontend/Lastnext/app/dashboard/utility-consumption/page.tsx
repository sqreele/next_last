import type { Metadata } from 'next';
import UtilityConsumptionView from './UtilityConsumptionView';

export const metadata: Metadata = {
  title: 'Utility Consumption',
};

export default function UtilityConsumptionPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="w-full max-w-none px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-7xl lg:px-8 desktop:max-w-[96rem]">
        <UtilityConsumptionView />
      </div>
    </div>
  );
}
