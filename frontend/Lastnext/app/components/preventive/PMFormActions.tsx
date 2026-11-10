"use client";
import { useFormikContext } from "formik";
import type { FormValues } from "./maintenance-form-types";
import { BouncingDotsLoader } from "@/app/components/ui/BouncingDotsLoader";
interface Props {
    pmId?: string | null;
    hasInitialData: boolean;
    onCancel?: () => void;
    isImageUploading: boolean;
    isLoading: boolean;
    loadingCapability: boolean;
    canOperate: boolean | null;
}
export function PMFormActions({ pmId, hasInitialData, onCancel, isImageUploading, isLoading, loadingCapability, canOperate }: Props) {
 const { values, isSubmitting } = useFormikContext<FormValues>();
 return (
    <div
      className="fixed bottom-[4.5rem] left-0 right-0 z-20 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] md:static md:border-t-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none md:mt-8"
      style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-lg flex-col-reverse gap-3 md:max-w-none md:flex-row md:justify-between md:gap-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:w-auto h-12 sm:h-11 px-6 bg-gray-100 text-gray-700 font-medium rounded-md shadow-xs hover:bg-gray-200 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition-colors touch-target"
              disabled={isSubmitting || isLoading}
            >
              Cancel
            </button>
          )}
          {isImageUploading && (
            <BouncingDotsLoader size="sm" label="Uploading images..." className="py-2 text-sm text-blue-600" />
          )}
        </div>
        <button
          type="submit"
          className={`w-full sm:w-auto h-12 sm:h-11 px-6 ${
            isSubmitting || isLoading
              ? "bg-blue-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/30"
          } text-white font-bold rounded-md focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors touch-target`}
          disabled={
            isSubmitting ||
            isLoading ||
            (!pmId &&
              (!values.property_id ||
                loadingCapability ||
                canOperate !== true))
          }
        >
          {isSubmitting || isLoading ? (
            <div className="flex items-center justify-center">
              <BouncingDotsLoader size="sm" />
              <span>
                {pmId || hasInitialData
                  ? "Updating..."
                  : "Creating..."}
              </span>
            </div>
          ) : (
            <span>
              {pmId || hasInitialData
                ? "Update Maintenance"
                : "Create Maintenance"}
            </span>
          )}
        </button>
      </div>
    </div>
 );
}
