"use client";

import { Field, useFormikContext } from "formik";
import type { FormValues } from "./maintenance-form-types";
import { BouncingDotsLoader } from "@/app/components/ui/BouncingDotsLoader";
import type { MachineDetails } from "@/app/lib/preventiveMaintenanceModels";
import { normalizeGroupId, type MaintenanceTaskOption } from "./maintenance-form-types";

interface Props {
    loadingMachines: boolean;
    availableMachines: MachineDetails[];
    availableMaintenanceTasks: MaintenanceTaskOption[];
    machineId?: string;
    error: string | null;
    fetchAvailableMachines: (propertyId?: string) => Promise<void>;
}
export function PMMachineSection({ loadingMachines, availableMachines, availableMaintenanceTasks, machineId, error, fetchAvailableMachines }: Props) {
  const { values, errors, touched } = useFormikContext<FormValues>();
  return (<>
    <div className="mb-4 sm:mb-6">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Machines <span className="text-red-500">*</span>{" "}
        {loadingMachines && (
          <span className="text-xs text-gray-500">
            (Loading...)
          </span>
        )}
      </label>
      <p className="mb-2 text-xs text-gray-500">
        {values.selected_machine_ids.length} selected
      </p>
      <div
        className={`border rounded-md p-3 sm:p-4 max-h-60 overflow-y-auto bg-white scroll-momentum ${
          errors.selected_machine_ids &&
          touched.selected_machine_ids
            ? "border-red-500"
            : "border-gray-300"
        }`}
        role="group"
        aria-label="Select machine concerns"
      >
        {!values.property_id ? (
          <p className="text-sm text-gray-500">
            Please select a property to see available machines.
          </p>
        ) : loadingMachines ? (
          <BouncingDotsLoader size="md" label="Loading machines..." className="h-24 w-full text-sm text-gray-500" />
        ) : (
          (() => {
            const selectedTask = availableMaintenanceTasks.find(
              (t) => t.id === Number(values.procedure_template),
            );
            const selectedTaskGroupId = normalizeGroupId(
              selectedTask?.group_id,
            );
            const selectedTaskMachineIds = new Set(
              (selectedTask?.machine_ids ?? []).map((id) =>
                String(id),
              ),
            );
            const machinesMatchingTemplate =
              selectedTaskMachineIds.size > 0
                ? availableMachines.filter((m) =>
                    selectedTaskMachineIds.has(
                      String(m.machine_id),
                    ),
                  )
                : selectedTaskGroupId
                  ? availableMachines.filter(
                      (m) =>
                        normalizeGroupId(m.group_id) ===
                        selectedTaskGroupId,
                    )
                  : availableMachines;
            const machinesToShow = machineId
              ? machinesMatchingTemplate.filter(
                  (m) => String(m.machine_id) === String(machineId),
                )
              : machinesMatchingTemplate;

            const preselectedMachineAtProperty = machineId
              ? availableMachines.find(
                  (machine) =>
                    String(machine.machine_id) ===
                    String(machineId),
                )
              : undefined;

            return machinesToShow.length > 0 ? (
              <div className="space-y-2 sm:space-y-3">
                {machinesToShow.map((machineItem) => {
                  const isPreSelected =
                    !!machineId &&
                    machineItem.machine_id === machineId;
                  return (
                    <div
                      key={machineItem.machine_id}
                      className="relative"
                    >
                      <label
                        className={`flex items-start sm:items-center gap-2 sm:gap-3 py-2 ${isPreSelected ? "cursor-default" : "cursor-pointer touch-feedback"}`}
                      >
                        <Field name="selected_machine_ids">
                          {({
                            field: { value: selectedMachinesValue },
                            form: {
                              setFieldValue: setMachineFieldValue,
                            },
                          }: any) => (
                            <input
                              type="checkbox"
                              className="h-5 w-5 sm:h-4 sm:w-4 mt-0.5 sm:mt-0 text-blue-600 bg-gray-100 border-gray-300 rounded-sm focus:ring-blue-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed touch-target"
                              id={`machine-${machineItem.machine_id}`}
                              checked={selectedMachinesValue.includes(
                                machineItem.machine_id,
                              )}
                              disabled={isPreSelected}
                              onChange={(e) => {
                                if (isPreSelected) return; // Prevent unchecking if pre-selected
                                const currentSelection =
                                  selectedMachinesValue || [];
                                if (e.target.checked) {
                                  setMachineFieldValue(
                                    "selected_machine_ids",
                                    [
                                      ...currentSelection,
                                      machineItem.machine_id,
                                    ],
                                  );
                                } else {
                                  setMachineFieldValue(
                                    "selected_machine_ids",
                                    currentSelection.filter(
                                      (id: string) =>
                                        id !==
                                        machineItem.machine_id,
                                    ),
                                  );
                                }
                              }}
                            />
                          )}
                        </Field>
                        <span
                          className={`text-sm sm:text-base flex-1 break-words ${isPreSelected ? "text-gray-900 font-medium" : "text-gray-700"}`}
                        >
                          <span className="block sm:inline">
                            {machineItem.name}
                          </span>
                          <span className="block sm:inline text-xs sm:text-sm text-gray-500 font-mono">
                            ({machineItem.machine_id})
                          </span>
                          {isPreSelected && (
                            <span className="block sm:inline ml-0 sm:ml-2 mt-1 sm:mt-0 text-xs text-blue-600">
                              (Pre-selected)
                            </span>
                          )}
                        </span>
                      </label>
                      {values.selected_machine_ids.includes(
                        machineItem.machine_id,
                      ) && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-full"></div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6">
                {machineId ? (
                  <p className="text-sm text-gray-500 mb-3">
                    {preselectedMachineAtProperty
                      ? `Machine ${machineId} is at this property, but it is not linked to the selected maintenance task template.`
                      : `Machine ${machineId} was not found among the machines available for this property.`}
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-gray-500 mb-3">
                      No machine concerns are available for the
                      selected template and property.
                    </p>
                    {values.property_id && !error && (
                      <button
                        type="button"
                        onClick={() =>
                          fetchAvailableMachines(
                            values.property_id ?? undefined,
                          )
                        }
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Refresh Machines
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })()
        )}
      </div>
      {errors.selected_machine_ids &&
        touched.selected_machine_ids && (
          <p className="mt-1 text-sm text-red-500">
            {errors.selected_machine_ids}
          </p>
        )}
    </div>
  </>);
}
