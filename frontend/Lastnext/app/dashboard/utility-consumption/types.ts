import type { UtilityMonthName } from '@/app/lib/api/utility-consumption-contracts';

export type MonthName = UtilityMonthName;

export type MetricKey =
  | 'totalkwh'
  | 'onpeakkwh'
  | 'offpeakkwh'
  | 'totalelectricity'
  | 'water'
  | 'nightsale';

export interface UtilityConsumptionRow {
  month: MonthName;
  year: number;
  totalkwh: number;
  onpeakkwh: number;
  offpeakkwh: number;
  totalelectricity: number;
  electricity_cost_budget: number;
  water: number;
  nightsale: number;
}
