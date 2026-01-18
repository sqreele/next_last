export type MonthName =
  | 'January'
  | 'February'
  | 'March'
  | 'April'
  | 'May'
  | 'June'
  | 'July'
  | 'August'
  | 'September'
  | 'October'
  | 'November'
  | 'December';

export type MetricKey = 'totalkwh' | 'totalelectricity' | 'water' | 'nightsale';

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
