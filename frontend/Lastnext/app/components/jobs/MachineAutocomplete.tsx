"use client";

import type { Machine } from "@/app/lib/MachineService";
import { useT } from "@/app/lib/i18n/LocaleProvider";
import { SearchablePicker } from "@/app/components/ui/searchable-picker";

interface MachineAutocompleteProps {
  machines: Machine[];
  value: string;
  onSelect: (machineId: string) => void;
  onBlur: () => void;
  disabled?: boolean;
  invalid?: boolean;
}

export default function MachineAutocomplete({
  machines,
  value,
  onSelect,
  onBlur,
  disabled,
  invalid,
}: MachineAutocompleteProps) {
  const t = useT();
  return (
    <SearchablePicker
      id="machine_id"
      label={t("createJob.machine")}
      placeholder={t("createJob.selectMachine")}
      options={machines.map((machine) => ({
        value: machine.machine_id,
        label: machine.name,
        description: machine.machine_id,
      }))}
      value={value}
      onValueChange={onSelect}
      onBlur={onBlur}
      disabled={disabled}
      invalid={invalid}
      errorId="machine-error"
      searchPlaceholder={t("createJob.searchMachines")}
      hint={t("createJob.machinePickerHint")}
      emptyText={t("createJob.noMachines")}
      noMatchesText={t("createJob.noMachineMatches")}
    />
  );
}
