"use client";

import { Field, useFormikContext } from "formik";
import type { FormValues } from "./maintenance-form-types";
import type React from "react";
import type { FrequencyType } from "@/app/lib/preventiveMaintenanceModels";
import type { MaintenanceTaskOption } from "./maintenance-form-types";

interface Props {
    loadingMaintenanceTasks: boolean;
    availableMaintenanceTasks: MaintenanceTaskOption[];
    calculateNextScheduledDate: (frequency: string, customDays?: number, baseDate?: Date) => Date;
    formatDateForInput: (date: Date) => string;
}
export function PMTemplateSection({ loadingMaintenanceTasks, availableMaintenanceTasks, calculateNextScheduledDate, formatDateForInput }: Props) {
  const { values, touched, errors, setFieldValue } = useFormikContext<FormValues>();
  return (<>
    <div className="mb-4 sm:mb-6">
      <label
        htmlFor="procedure_template"
        className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2"
      >
        Maintenance Task Template (Optional){" "}
        {loadingMaintenanceTasks && (
          <span className="text-xs text-gray-500 ml-2">
            (Loading...)
          </span>
        )}
        {!loadingMaintenanceTasks &&
          availableMaintenanceTasks.length === 0 && (
            <span className="text-xs text-amber-600 ml-2">
              (No tasks available)
            </span>
          )}
      </label>
      <Field
        as="select"
        id="procedure_template"
        name="procedure_template"
        className={`w-full p-2.5 sm:p-3 text-base sm:text-sm border rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 touch-target ${
          errors.procedure_template && touched.procedure_template
            ? "border-red-500"
            : "border-gray-300"
        }`}
        disabled={loadingMaintenanceTasks}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
          const taskId = e.target.value ? Number(e.target.value) : "";
          setFieldValue("procedure_template", taskId);

          // If a task is selected, auto-populate fields based on template
          if (taskId) {
            const selectedTask = availableMaintenanceTasks.find(
              (t) => t.id === Number(taskId),
            );
            if (selectedTask) {
              // Auto-populate title if empty
              if (!values.pmtitle || values.pmtitle.trim() === "") {
                setFieldValue("pmtitle", selectedTask.name);
              }

              // CRITICAL: Auto-set frequency and calculate scheduled_date based on template frequency
              if (
                selectedTask.frequency &&
                selectedTask.frequency.trim() !== "" &&
                selectedTask.frequency !== "N/A"
              ) {
                const templateFrequency = selectedTask.frequency
                  .toLowerCase()
                  .trim();
                const validFrequencies: FrequencyType[] = [
                  "daily",
                  "weekly",
                  "monthly",
                  "quarterly",
                  "semi_annual",
                  "annual",
                  "custom",
                ];

                if (
                  validFrequencies.includes(
                    templateFrequency as FrequencyType,
                  )
                ) {
                  // Set frequency from template
                  setFieldValue(
                    "frequency",
                    templateFrequency as FrequencyType,
                  );

                  if (templateFrequency === "custom") {
                    // Custom intervals do not imply a first due date.
                    // Require the user to choose the schedule explicitly.
                    setFieldValue("scheduled_date", "");
                  } else {
                    const nextDate = calculateNextScheduledDate(
                      templateFrequency,
                    );
                    setFieldValue(
                      "scheduled_date",
                      formatDateForInput(nextDate),
                    );
                  }

                  // Set custom_days if frequency is custom
                  if (
                    templateFrequency === "custom" &&
                    selectedTask.custom_days
                  ) {
                    setFieldValue(
                      "custom_days",
                      selectedTask.custom_days,
                    );
                  } else if (templateFrequency !== "custom") {
                    // Clear custom_days if not custom frequency
                    setFieldValue("custom_days", "");
                  }
                } else {
                  console.warn(
                    `[Template Selection] Invalid frequency "${selectedTask.frequency}" from template, using default`,
                  );
                }
              } else {
                console.warn(
                  `[Template Selection] Template has no valid frequency, keeping current values`,
                );
              }
            } else {
              console.warn(
                `[Template Selection] Template with ID ${taskId} not found in available tasks`,
              );
            }
          } else {
            // Template deselected - reset to defaults
            setFieldValue("frequency", "monthly");
            setFieldValue("custom_days", "");
          }
        }}
      >
        <option value="">Select a maintenance task template</option>
        {loadingMaintenanceTasks ? (
          <option disabled>Loading tasks...</option>
        ) : availableMaintenanceTasks.length === 0 ? (
          <option disabled>No tasks available</option>
        ) : (
          availableMaintenanceTasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.name}
              {task.category ? ` - ${task.category}` : ""} [
              {task.frequency.toUpperCase()}] -{" "}
              {task.difficulty_level}
            </option>
          ))
        )}
      </Field>
      <p className="mt-1 text-xs text-gray-500">
        {loadingMaintenanceTasks
          ? "Loading available task templates..."
          : availableMaintenanceTasks.length === 0
            ? "No task templates available for the current selection."
            : "Choose a shared template to prefill frequency and narrow compatible machines, or create without one."}
      </p>

      {errors.procedure_template && touched.procedure_template && (
        <p className="mt-1 text-xs sm:text-sm text-red-500">
          {errors.procedure_template}
        </p>
      )}
      {!loadingMaintenanceTasks &&
        availableMaintenanceTasks.length === 0 &&
        values.selected_machine_ids &&
        values.selected_machine_ids.length > 0 && (
          <p className="mt-1 text-xs text-amber-600">
            No tasks match the selected machine(s). Tasks are filtered
            by machine group_id or linked procedures.
          </p>
        )}
    </div>
  </>);
}
