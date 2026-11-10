import * as Yup from "yup";
import type { DictKey } from "@/app/lib/i18n/dictionary";
import type { Room } from "@/app/lib/types";

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_BEFORE_FILES = 20;
export const MAX_AFTER_FILES = 5;
export type TFunction = (key: DictKey) => string;

export function formatMessage(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export interface FormValues {
  description: string;
  status: string;
  priority: string;
  remarks: string;
  topic: {
    title: string;
    description: string;
  };
  locationType: "location" | "machine";
  machine_id: string;
  documents: File[];
  room: Room | null;
  area_id: number | null;
  floor: string | null;
  files: File[];
  afterFiles: File[];
  beforeImageTokens: string[];
  afterImageTokens: string[];
  is_defective: boolean;
  is_preventivemaintenance: boolean;
  procedure_template: number | null;
}

export const createValidationSchema = (t: TFunction) =>
  Yup.object().shape({
    description: Yup.string().required(
      t("createJob.validation.descriptionRequired"),
    ),
    status: Yup.string().required(t("createJob.validation.statusRequired")),
    priority: Yup.string().required(t("createJob.validation.priorityRequired")),
    remarks: Yup.string().optional(),
    topic: Yup.object().shape({
      title: Yup.string(),
      description: Yup.string(),
    }).test("location-category", t("createJob.validation.categoryRequired"), function (topic) {
      if (this.parent.locationType === "machine" || topic?.title?.trim()) return true;
      return this.createError({ path: `${this.path}.title`, message: t("createJob.validation.categoryRequired") });
    }),
    procedure_template: Yup.number().nullable().test(
      "machine-template-required", t("createJob.selectMaintenanceTemplate"), function (value) {
        return this.parent.locationType !== "machine" || Boolean(value);
      },
    ),
    machine_id: Yup.string().test("machine-required", t("createJob.machineRequired"), function (value) {
      return this.parent.locationType !== "machine" || Boolean(value);
    }),
    documents: Yup.array().of(Yup.mixed<File>().test("pdf", t("createJob.pdfInvalid"), (file) =>
      !file || (file.size <= 2 * 1024 * 1024 && /\.pdf$/i.test(file.name))
    )).max(3, t("createJob.pdfLimit")),
    room: Yup.object()
      .nullable()
      .shape({
        room_id: Yup.number()
          .typeError(t("createJob.validation.invalidRoom"))
          .min(1, t("createJob.validation.roomRequired")),
        name: Yup.string(),
      })
      .test(
        "room-or-area",
        t("createJob.validation.roomOrArea"),
        function (value) {
          if (this.parent.locationType === "machine") return true;
          const areaId = this.parent.area_id;
          if (areaId) return true;
          return Boolean(value && (value as { room_id?: number }).room_id);
        },
      ),
    area_id: Yup.number()
      .nullable()
      .test(
        "area-or-room",
        t("createJob.validation.roomOrArea"),
        function (value) {
          if (this.parent.locationType === "machine") return true;
          const room = this.parent.room as { room_id?: number } | null;
          if (room && room.room_id) return true;
          return value != null;
        },
      ),
    files: Yup.array()
      .of(
        Yup.mixed<File>()
          .test(
            "fileSize",
            t("createJob.validation.fileTooLarge"),
            (value) =>
              !value || !(value instanceof File) || value.size <= MAX_FILE_SIZE,
          )
          .test(
            "fileType",
            t("createJob.validation.onlyImages"),
            (value) =>
              !value ||
              !(value instanceof File) ||
              value.type.startsWith("image/"),
          ),
      )
      .min(1, t("createJob.validation.imageRequired"))
      .max(
        MAX_BEFORE_FILES,
        formatMessage(t("createJob.validation.maxBeforeImages"), {
          max: MAX_BEFORE_FILES,
        }),
      )
      .required(t("createJob.validation.beforeImageRequired")),
    afterFiles: Yup.array()
      .of(
        Yup.mixed<File>()
          .test(
            "fileSize",
            t("createJob.validation.fileTooLarge"),
            (value) =>
              !value || !(value instanceof File) || value.size <= MAX_FILE_SIZE,
          )
          .test(
            "fileType",
            t("createJob.validation.onlyImages"),
            (value) =>
              !value ||
              !(value instanceof File) ||
              value.type.startsWith("image/"),
          ),
      )
      .max(
        MAX_AFTER_FILES,
        formatMessage(t("createJob.validation.maxAfterImages"), {
          max: MAX_AFTER_FILES,
        }),
      )
      .test(
        "after-only-when-completed",
        t("createJob.validation.afterImagesRequireCompleted"),
        function (value) {
          return !value?.length || this.parent.status === "completed";
        },
      ),
    is_defective: Yup.boolean().default(false),
    is_preventivemaintenance: Yup.boolean().default(false),
  });
