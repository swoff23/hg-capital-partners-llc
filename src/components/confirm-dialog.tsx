"use client";

/**
 * Small modal confirmation. Click outside or the caller's Cancel action closes it.
 * The title names the object; the body is one sentence of consequence. A
 * destructive confirm is a `destructive` Button that names what goes
 * ("Delete task"), beside a secondary Cancel or Keep it.
 */
export function ConfirmDialog({
  title,
  body,
  actions,
  onClose,
}: {
  title: string;
  /** Optional when the title already says it all. */
  body?: React.ReactNode;
  actions: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-xl border border-line-float bg-raised p-5 shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="text-section text-fg-1">{title}</h4>
        {body && <div className="mt-1 text-body text-fg-2">{body}</div>}
        <div className="mt-4 flex items-center justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}
