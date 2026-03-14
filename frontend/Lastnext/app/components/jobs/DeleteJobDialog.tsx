// ./components/jobs/DeleteJobDialog.tsx
"use client";

import React from 'react';
import { Button } from '@/app/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose, // Import DialogClose
} from '@/app/components/ui/dialog';
import { Loader, AlertTriangle } from 'lucide-react';

interface DeleteDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>; // Confirmation handler
    isSubmitting: boolean; // Loading state
    jobId: string | number | undefined | null; // Job ID to display
}

const DeleteJobDialog: React.FC<DeleteDialogProps> = ({
    isOpen,
    onClose,
    onConfirm,
    isSubmitting,
    jobId,
}) => {
    if (!isOpen) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px] relative">
                {/* Full-screen deleting overlay when submitting (inside portal so it stacks above dialog) */}
                {isSubmitting && (
                    <div
                        className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-white/90 backdrop-blur-sm"
                        aria-live="polite"
                        aria-busy="true"
                        role="status"
                    >
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 shadow-inner">
                            <Loader className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
                        </div>
                        <p className="text-center text-lg font-medium text-gray-700 sm:text-xl">
                            Deleting, please wait…
                        </p>
                    </div>
                )}
                <DialogHeader>
                    <DialogTitle className="flex items-center">
                       <AlertTriangle className="h-5 w-5 mr-2 text-red-600" /> Confirm Deletion
                    </DialogTitle>
                    <DialogDescription>
                        Are you sure you want to delete maintenance job{' '}
                        <span className="font-medium">#{jobId ?? ''}</span>? This action
                        cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="mt-4">
                     {/* DialogClose automatically handles closing */}
                    <DialogClose asChild>
                         <Button type="button" variant="outline" disabled={isSubmitting}>
                            Cancel
                        </Button>
                    </DialogClose>
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={onConfirm} // Call confirm handler
                        disabled={isSubmitting}
                    >
                        {isSubmitting && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                        Delete Job
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default DeleteJobDialog;