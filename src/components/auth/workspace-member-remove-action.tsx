"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

type WorkspaceMemberRemoveActionProps = {
  action: string;
  buttonLabel: string;
  cancelLabel: string;
  confirmLabel: string;
  deletingLabel: string;
  dialogBody: string;
  dialogTitle: string;
  recordLabel: string;
  warning: string;
};

export function WorkspaceMemberRemoveAction({
  action,
  buttonLabel,
  cancelLabel,
  confirmLabel,
  deletingLabel,
  dialogBody,
  dialogTitle,
  recordLabel,
  warning,
}: WorkspaceMemberRemoveActionProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <>
      <form
        action={action}
        className="hidden"
        method="post"
        onSubmit={() => {
          setIsSubmitting(true);
        }}
        ref={formRef}
      />
      <button
        className="inline-flex h-8 max-w-full items-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
        {buttonLabel}
      </button>

      {isOpen ? (
        <ConfirmDeleteDialog
          body={dialogBody}
          cancelLabel={cancelLabel}
          confirmLabel={confirmLabel}
          deletingLabel={deletingLabel}
          isDeleting={isSubmitting}
          onCancel={() => {
            if (!isSubmitting) {
              setIsOpen(false);
            }
          }}
          onConfirm={() => formRef.current?.requestSubmit()}
          recordLabel={recordLabel}
          title={dialogTitle}
          warning={warning}
        />
      ) : null}
    </>
  );
}
