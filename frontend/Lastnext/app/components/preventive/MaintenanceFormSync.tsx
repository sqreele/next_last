"use client";

import { useEffect } from "react";
import { useFormikContext } from "formik";
import type { MachineDetails } from "@/app/lib/preventiveMaintenanceModels";
import { normalizeGroupId, type FormValues, type MaintenanceTaskOption } from "./maintenance-form-types";

interface MaintenanceFormSyncProps {
  pmId?: string | null;
  selectedProperty: string | null;
  machineId?: string;
  loadingMachines: boolean;
  availableMachines: MachineDetails[];
  availableMaintenanceTasks: MaintenanceTaskOption[];
  fetchAvailableMaintenanceTasks: (machineIds?: string[]) => Promise<void>;
}

/** Keep dependent Formik fields in sync without Hooks inside a render callback. */
export function MaintenanceFormSync({
  pmId, selectedProperty, machineId, loadingMachines, availableMachines,
  availableMaintenanceTasks, fetchAvailableMaintenanceTasks,
}: MaintenanceFormSyncProps) {
  const { values, setFieldValue } = useFormikContext<FormValues>();

  useEffect(() => {
    if (pmId) return;
    const nextPropertyId = selectedProperty || "";
    const currentValue = values.property_id || "";
    if (nextPropertyId !== currentValue) {
      setFieldValue("property_id", nextPropertyId, false);
    }
  }, [pmId, selectedProperty, values.property_id, setFieldValue]);

  // Auto-select machine when machineId prop is provided
  useEffect(() => {
    // Once a template is chosen, its machine relationship is authoritative.
    // Do not re-add a machine that the template-matching effect removed.
    if (!machineId || pmId || values.procedure_template !== "") {
      return;
    }

    const machineIdStr = String(machineId);
    const isAlreadySelected =
      values.selected_machine_ids.includes(machineIdStr);

    // Wait for machines to finish loading before auto-selecting
    if (loadingMachines) {
      return;
    }

    // If machines are loaded, validate and select the machine
    if (availableMachines.length > 0) {
      const machineExists = availableMachines.some(
        (m) => m.machine_id === machineIdStr,
      );

      if (machineExists) {
        // Machine exists - select it if not already selected
        if (!isAlreadySelected) {
          const newMachineIds = [
            machineIdStr,
            ...values.selected_machine_ids.filter(
              (id) => id !== machineIdStr,
            ),
          ];
          setFieldValue("selected_machine_ids", newMachineIds, false);
        }
      } else if (isAlreadySelected) {
        setFieldValue(
          "selected_machine_ids",
          values.selected_machine_ids.filter(
            (id) => id !== machineIdStr,
          ),
          false,
        );
      }
    }
  }, [
    machineId,
    pmId,
    availableMachines,
    loadingMachines,
    values.selected_machine_ids,
    values.property_id,
    values.procedure_template,
    setFieldValue,
  ]);

  // Refetch maintenance tasks from preselected machines only until a template is chosen.
  useEffect(() => {
    if (pmId || values.procedure_template !== "") return;

    if (values.selected_machine_ids.length > 0) {
      fetchAvailableMaintenanceTasks(values.selected_machine_ids);
    } else {
      fetchAvailableMaintenanceTasks();
    }
  }, [
    values.selected_machine_ids,
    values.procedure_template,
    pmId,
    fetchAvailableMaintenanceTasks,
  ]);

  useEffect(() => {
    if (values.procedure_template === "") {
      return;
    }

    const selectedTask = availableMaintenanceTasks.find(
      (t) => t.id === Number(values.procedure_template),
    );
    const selectedTaskGroupId = normalizeGroupId(
      selectedTask?.group_id,
    );
    const selectedTaskMachineIds = new Set(
      (selectedTask?.machine_ids ?? []).map((id) => String(id)),
    );
    if (selectedTaskMachineIds.size === 0 && !selectedTaskGroupId)
      return;

    const allowedMachineIds =
      selectedTaskMachineIds.size > 0
        ? selectedTaskMachineIds
        : new Set(
            availableMachines
              .filter(
                (machine) =>
                  normalizeGroupId(machine.group_id) ===
                  selectedTaskGroupId,
              )
              .map((machine) => machine.machine_id),
          );
    const nextMachineIds = values.selected_machine_ids.filter((id) =>
      allowedMachineIds.has(id),
    );
    if (nextMachineIds.length !== values.selected_machine_ids.length) {
      setFieldValue("selected_machine_ids", nextMachineIds, false);
    }
  }, [
    availableMachines,
    availableMaintenanceTasks,
    values.procedure_template,
    values.selected_machine_ids,
    setFieldValue,
  ]);

  return null;
}
