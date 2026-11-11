export interface CategorizedMachine {
  machine_id: string;
  category?: string | null;
  status?: string;
}

export interface MachineCategoryGroup<T extends CategorizedMachine = CategorizedMachine> {
  key: string;
  label: string | null;
  machines: T[];
}

export function groupMachinesByCategory<T extends CategorizedMachine>(machines: T[]): MachineCategoryGroup<T>[] {
  const groups = new Map<string, MachineCategoryGroup<T>>();
  for (const machine of machines) {
    const label = machine.category?.trim() || null;
    const key = label ? `category:${label.toLowerCase()}` : 'uncategorized';
    let group = groups.get(key);
    if (!group) {
      group = { key, label, machines: [] };
      groups.set(key, group);
    }
    group.machines.push(machine);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.label === null) return b.label === null ? 0 : 1;
    if (b.label === null) return -1;
    return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
  });
}
