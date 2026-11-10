import type { FormikErrors } from "formik";
import type { FormValues } from "./maintenance-form-types";

export function validateMaintenanceForm(values: FormValues, pmId?: string | null): FormikErrors<FormValues> {
    const errors: FormikErrors<FormValues> = {};

    if (!values.pmtitle?.trim()) errors.pmtitle = "Title is required";
    if (!values.scheduled_date)
      errors.scheduled_date = "Scheduled date is required";
    if (!values.status) errors.status = "Status is required";

    // Validate date formats
    if (values.scheduled_date) {
      try {
        const scheduledDate = new Date(values.scheduled_date);
        if (isNaN(scheduledDate.getTime())) {
          errors.scheduled_date = "Invalid scheduled date format";
        } else {
          // Allow scheduling for current day and past dates for record-keeping
          // Only show warning for dates more than 1 day in the past
          if (!pmId) {
            const now = new Date();
            const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            if (scheduledDate < oneDayAgo) {
              // Allow but show a warning - this could be for record-keeping
              console.warn(
                "Scheduled date is more than 1 day in the past:",
                scheduledDate,
              );
            }
          }
        }
      } catch {
        errors.scheduled_date = "Invalid scheduled date format";
      }
    }

    // Only validate completed_date if it's provided (for edit mode)
    // For new records, completed_date should be empty
    if (values.completed_date && values.completed_date.trim() !== "") {
      try {
        const completedDate = new Date(values.completed_date);
        if (isNaN(completedDate.getTime())) {
          errors.completed_date = "Invalid completed date format";
        } else if (values.scheduled_date) {
          // Ensure completed date is not before scheduled date
          const scheduledDate = new Date(values.scheduled_date);
          if (completedDate < scheduledDate) {
            errors.completed_date =
              "Completed date cannot be before scheduled date";
          }
        }
      } catch {
        errors.completed_date = "Invalid completed date format";
      }
    }

    // For new records, ensure completed_date is empty
    if (!pmId && values.completed_date && values.completed_date.trim() !== "") {
      errors.completed_date =
        "Completed date should be empty for new maintenance records";
    }

    if (!values.frequency) errors.frequency = "Frequency is required";
    if (values.frequency === "custom") {
      const customDays = Number(values.custom_days);
      if (!values.custom_days || Number.isNaN(customDays) || customDays < 1) {
        errors.custom_days = "Custom days must be at least 1";
      }
    }
    if (!values.property_id) errors.property_id = "Property is required";
    if (values.selected_machine_ids.length === 0) {
      errors.selected_machine_ids = "Select at least one machine";
    }
    // assigned_to is optional - defaults to current user if not provided
    // if (!values.assigned_to) {
    //   errors.assigned_to = 'Assigned user is required';
    // }
    // Topics are now optional
    // if (!values.selected_topics || values.selected_topics.length === 0) {
    //   errors.selected_topics = 'At least one topic must be selected';
    // }

    return errors;
  }
