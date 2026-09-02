"use client";

/** Small modal confirmation. Click outside or the caller's Cancel action closes it. */
export function ConfirmDialog({
  title,
  body,
  actions,
  onClose,
}: {
  title: string;
  body: React.ReactNode;
  actions: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="text-sm font-semibold">{title}</h4>
        <div className="mt-1 text-xs text-muted">{body}</div>
        <div className="mt-4 flex items-center justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}
