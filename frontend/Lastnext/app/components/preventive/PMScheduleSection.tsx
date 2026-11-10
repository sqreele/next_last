"use client";

import { Field, useFormikContext } from "formik";
import type { FormValues } from "./maintenance-form-types";
import type React from "react";
import { FREQUENCY_OPTIONS, type FrequencyType } from "@/app/lib/preventiveMaintenanceModels";

interface Props {
    pmId?: string | null;
    propertyTimezone: string | null;
    nextDueLabel: string;
}
export function PMScheduleSection({ pmId, propertyTimezone, nextDueLabel }: Props) {
  const { values, errors, touched, setFieldValue } = useFormikContext<FormValues>();
  return (<>
    <div className="mb-4 sm:mb-6">
      <label
        htmlFor="pmtitle"
        className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2"
      >
        Maintenance Title <span className="text-red-500">*</span>
      </label>
      <Field
        type="text"
        id="pmtitle"
        name="pmtitle"
        className={`w-full p-2.5 sm:p-3 text-base sm:text-sm border rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
          errors.pmtitle && touched.pmtitle
            ? "border-red-500"
            : "border-gray-300"
        }`}
        placeholder="Enter maintenance title"
      />
      {errors.pmtitle && touched.pmtitle && (
        <p className="mt-1 text-xs sm:text-sm text-red-500">
          {errors.pmtitle}
        </p>
      )}
    </div>

    {/* Scheduled Date */}
    <div className="mb-4 sm:mb-6">
      <label
        htmlFor="scheduled_date"
        className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2"
      >
        Scheduled Date & Time <span className="text-red-500">*</span>
      </label>
      <Field
        type="datetime-local"
        id="scheduled_date"
        name="scheduled_date"
        className={`w-full p-2.5 sm:p-3 text-base sm:text-sm border rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
          errors.scheduled_date && touched.scheduled_date
            ? "border-red-500"
            : "border-gray-300"
        }`}
      />
      <p className="mt-1 text-xs text-gray-500">
        Entered as wall time in {propertyTimezone || "the selected property tenant timezone"}.
      </p>
      {errors.scheduled_date && touched.scheduled_date && (
        <p className="mt-1 text-xs sm:text-sm text-red-500">
          {errors.scheduled_date}
        </p>
      )}
    </div>

    {!pmId && (
      <div className="mb-4 sm:mb-6 rounded-xl border border-purple-200 bg-purple-50 p-3 sm:p-4">
        <label className="flex items-start gap-3 text-sm font-semibold text-purple-900">
          <Field
            type="checkbox"
            name="create_master_plan"
            className="mt-1 h-4 w-4 rounded-sm border-purple-300"
          />
          <span>
            Create as PM Master Plan / Recurring Rule
            <span className="block text-xs font-medium text-purple-700">
              Calendar will show projected occurrences first. Actual
              PM forms are generated inside the lead window.
            </span>
          </span>
        </label>
        {values.create_master_plan && (
          <div className="mt-3">
            <label
              htmlFor="lead_time_days"
              className="block text-xs font-bold text-purple-900"
            >
              Generate PM form before due date (days)
            </label>
            <Field
              type="number"
              min="0"
              id="lead_time_days"
              name="lead_time_days"
              className="mt-1 w-full rounded-md border border-purple-200 p-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            />
          </div>
        )}
      </div>
    )}

    <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 sm:mb-6">
      <p className="text-sm font-medium text-slate-700">Status</p>
      <p className="mt-1 text-sm capitalize text-slate-600">
        {pmId ? values.status.replaceAll("_", " ") : "Pending"}
        {" · "}State changes and completion are recorded through the
        maintenance workflow.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Expected next due: {nextDueLabel}.
      </p>
    </div>

    {/* Completed Date - Only show when editing existing records */}
    {pmId && (
      <div className="mb-4 sm:mb-6">
        <label
          htmlFor="completed_date"
          className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2"
        >
          Completed Date & Time
        </label>
        <Field
          type="datetime-local"
          id="completed_date"
          name="completed_date"
          className="w-full p-2.5 sm:p-3 text-base sm:text-sm border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
        />
        {errors.completed_date && touched.completed_date && (
          <p className="mt-1 text-xs sm:text-sm text-red-500">
            {errors.completed_date}
          </p>
        )}
      </div>
    )}

    {/* Maintenance Frequency */}
    <div className="mb-6">
      <label
        htmlFor="frequency"
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        Maintenance Frequency
      </label>
      <Field
        as="select"
        id="frequency"
        name="frequency"
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
          const nextFrequency = e.target.value as FrequencyType;
          setFieldValue("frequency", nextFrequency);

          if (nextFrequency === "custom") {
            setFieldValue("scheduled_date", "");
          } else {
            setFieldValue("custom_days", "");
          }
        }}
        className={`w-full p-2 border rounded-md ${
          errors.frequency && touched.frequency
            ? "border-red-500"
            : "border-gray-300"
        }`}
      >
        {FREQUENCY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Field>
      {errors.frequency && touched.frequency && (
        <p className="mt-1 text-sm text-red-500">
          {errors.frequency}
        </p>
      )}
    </div>

    {/* Custom Days Interval */}
    {values.frequency === "custom" && (
      <div className="mb-6">
        <label
          htmlFor="custom_days"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Custom Days Interval
        </label>
        <Field
          type="number"
          id="custom_days"
          name="custom_days"
          min="1"
          className={`w-full p-2 border rounded-md ${
            errors.custom_days && touched.custom_days
              ? "border-red-500"
              : "border-gray-300"
          }`}
        />
        {errors.custom_days && touched.custom_days && (
          <p className="mt-1 text-sm text-red-500">
            {errors.custom_days}
          </p>
        )}
      </div>
    )}
  </>);
}
