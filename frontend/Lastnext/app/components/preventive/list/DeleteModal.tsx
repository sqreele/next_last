"use client";

import React from "react";
import { AlertCircle } from "lucide-react";

interface DeleteModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteModal: React.FC<DeleteModalProps> = ({ onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-card p-4 sm:p-6">
        <div className="flex items-center mb-4">
          <div className="shrink-0">
            <div className="bg-red-100 rounded-full p-2">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
          </div>
          <div className="ml-4">
            <h3 className="text-lg font-medium text-foreground">
              Confirm Deletion
            </h3>
            <p className="text-sm text-muted-foreground">
              This action cannot be undone.
            </p>
          </div>
        </div>
        <p className="text-muted-foreground mb-6 text-sm md:text-base">
          Are you sure you want to delete this maintenance task? All associated
          data will be permanently removed.
        </p>
        <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3">
          <button
            onClick={onCancel}
            className="min-h-11 w-full rounded-lg border border-border px-4 py-2 text-muted-foreground transition-colors hover:bg-muted sm:w-auto"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="min-h-11 w-full rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 sm:w-auto"
          >
            Delete Task
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteModal;
