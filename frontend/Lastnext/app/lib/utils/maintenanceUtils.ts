import { PreventiveMaintenance, determinePMStatus } from '@/app/lib/preventiveMaintenanceModels';

export function formatDate(dateString: string): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function getFrequencyText(frequency: string): string {
  const frequencyMap: { [key: string]: string } = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    semi_annual: 'Semi-Annual',
    annual: 'Annual',
    custom: 'Custom'
  };
  return frequencyMap[frequency] || frequency;
}

export function getStatusInfo(item: PreventiveMaintenance) {
  const status = determinePMStatus(item);
  const normalizedStatus = status?.toLowerCase();

  if (normalizedStatus === 'completed' || normalizedStatus === 'complete') {
    return { 
      text: 'Completed', 
      color: 'bg-green-100 text-green-800 border-green-200',
      icon: 'CheckCircle'
    };
  }

  if (normalizedStatus === 'overdue') {
    return { 
      text: 'Overdue', 
      color: 'bg-red-100 text-red-800 border-red-200',
      icon: 'AlertCircle'
    };
  }

  return { 
    text: normalizedStatus === 'scheduled' ? 'Scheduled' : 'Scheduled',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: 'Clock'
  };
}

export function getMachineNames(machines: PreventiveMaintenance['machines']): string {
  if (!machines?.length) return 'None';

  const names = machines
    .map((machine) => machine.name || machine.machine_id)
    .filter(Boolean);

  return names.length > 0 ? names.join(', ') : 'Unknown';
}
