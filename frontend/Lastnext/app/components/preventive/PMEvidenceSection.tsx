"use client";

import { useFormikContext } from "formik";
import type { FormValues } from "./maintenance-form-types";
import type { FormikHelpers } from "formik";
import FileUpload from "@/app/components/jobs/FileUpload";
import { PreviewImage } from "@/app/components/ui/UniversalImage";

interface Props {
    pmId?: string | null;
    isLoading: boolean;
    beforeImagePreview: string | null;
    afterImagePreview: string | null;
    setBeforeImagePreview: (value: string | null) => void;
    setAfterImagePreview: (value: string | null) => void;
    handleFileSelection: (files: File[], type: "before" | "after", setFieldValue: FormikHelpers<FormValues>["setFieldValue"]) => void;
}
export function PMEvidenceSection({ pmId, isLoading, beforeImagePreview, afterImagePreview, setBeforeImagePreview, setAfterImagePreview, handleFileSelection }: Props) {
  const { errors, touched, isSubmitting, setFieldValue } = useFormikContext<FormValues>();
  return (<>
    {pmId ? (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
          Before Image
        </label>
        <FileUpload
          onFileSelect={(files) =>
            handleFileSelection(files, "before", setFieldValue)
          }
          maxFiles={1}
          maxSize={5}
          error={errors.before_image_file as string}
          touched={touched.before_image_file}
          disabled={isSubmitting || isLoading}
        />
        {beforeImagePreview && (
          <div className="mt-3 relative w-full h-40 bg-gray-100 rounded-md overflow-hidden">
            <PreviewImage
              src={beforeImagePreview}
              alt="Before Maintenance Preview"
              className="w-full h-full object-contain"
              width={400}
              height={160}
            />
            <button
              type="button"
              onClick={() => {
                setBeforeImagePreview(null);
                setFieldValue("before_image_file", null);
              }}
              className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 w-6 h-6 flex items-center justify-center shadow-md"
              aria-label="Remove before image"
            >
              ×
            </button>
          </div>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
          After Image
        </label>
        <FileUpload
          onFileSelect={(files) =>
            handleFileSelection(files, "after", setFieldValue)
          }
          maxFiles={1}
          maxSize={5}
          error={errors.after_image_file as string}
          touched={touched.after_image_file}
          disabled={isSubmitting || isLoading}
        />
        {afterImagePreview && (
          <div className="mt-3 relative w-full h-40 bg-gray-100 rounded-md overflow-hidden">
            <PreviewImage
              src={afterImagePreview}
              alt="After Maintenance Preview"
              className="w-full h-full object-contain"
              width={400}
              height={160}
            />
            <button
              type="button"
              onClick={() => {
                setAfterImagePreview(null);
                setFieldValue("after_image_file", null);
              }}
              className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 w-6 h-6 flex items-center justify-center shadow-md"
              aria-label="Remove after image"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
    ) : (
      <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 sm:mb-6">
        <p className="font-medium text-slate-900">Evidence images</p>
        <p className="mt-1">
          Create the PM first, then add up to 10 before/after images
          from its detail page using the optimized evidence workflow.
        </p>
      </div>
    )}
  </>);
}
