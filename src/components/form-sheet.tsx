"use client";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useHoldLeave } from "@/components/leave-guard";
import { Sheet } from "@/components/sheet";
import { Switch } from "@/components/switch";
import { shortcutLabel, useModKey } from "@/components/use-platform";
import { Button, Kbd, SaveError } from "@/components/ui";
import { stableJson } from "@/lib/drafts";
import { cn } from "@/lib/utils";

export type FormSheetProps = {
  /** The sheet's title: "New task", "Unit 2", "Change login email". */
  title: string;
  isOpen: boolean;
  /** Every way out that lands: Cancel, X, Esc, the backdrop, and "Discard changes" in the question. */
  onOpenChange: (open: boolean) => void;
  /**
   * The primary, or ⌘↵ from any field. The form is `noValidate`, so nothing
   * stops it first: check, run the action (useRun or callAction) and close
   * on success. `data` is the form's fields; a controlled form ignores it.
   */
  onSubmit: (data: FormData, form: HTMLFormElement) => void;
  /** The primary's label, naming what it does: "Create task", "Save unit". */
  primary: string;
  /** The action is running: the primary keeps its label, turns busy and shows the Spinner; closing waits. */
  pending?: boolean;
  /**
   * A refusal that belongs to no field (no signal, a server error, a
   * conflict's line): one `--danger` line directly above the buttons.
   */
  error?: ReactNode;
  /** The primary can't act at all (not just "something's missing"): disabled, with `disabledReason` under it. */
  primaryDisabled?: boolean;
  /** One line under a disabled primary saying why. */
  disabledReason?: ReactNode;
  /**
   * "Create more" at the footer's left, from md (create sheets only): on,
   * a success keeps the sheet open with the fields cleared, so the next one
   * starts at once.
   */
  createMore?: { isSelected: boolean; onChange: (isSelected: boolean) => void };
  /**
   * The form's values. The sheet compares them with what it opened with, and
   * once they differ, Cancel, X and Esc ask before throwing them away, a
   * backdrop tap does nothing, and in-app links ask first (LeaveGuard).
   */
  values?: unknown;
  /** Overrides the comparison: the caller knows best (a restored draft, uploads in the form). */
  dirty?: boolean;
  /** The discard question, naming the object: "Discard the new task?", "Discard changes to Unit 2?". */
  discardTitle?: string;
  /** The question an in-app link asks while it's dirty: "Leave Unit 2?". */
  leaveTitle?: string;
  /**
   * What closing a changed sheet does. "ask" (the default) shows the discard
   * question. "silent" is the one-field sheet of a fact (forms 2.11): the
   * backdrop does nothing while the field holds a change, and X and Esc
   * throw that one value away without asking.
   */
  discard?: "ask" | "silent";
  /**
   * Each field's own line from the last refusal (`useRun().fieldErrors`,
   * keyed by field name). Not drawn here, the fields draw their own; when
   * they arrive, focus moves to the first invalid field and scrolls it to the
   * middle of the view (forms 2.0).
   */
  fieldErrors?: Record<string, string>;
  /** The centered dialog's width from md: `md` 512 (the default) or `lg` 672 (the unit and listing sheets). */
  size?: "md" | "lg";
  /** On a phone, take the full height even when the form is short: long forms. */
  fullHeight?: boolean;
  /** "public" draws it on the public site's dark tokens. */
  surface?: "app" | "public";
  className?: string;
  children: ReactNode;
};

const firstEmptyField =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])';

/**
 * A sheet holding one form (forms 2.9): making or editing one multi-field
 * thing, such as New task, a unit, a login. `Sheet` (a bottom sheet on
 * phones, a centered dialog from md), a `noValidate` form, and the footer:
 *
 *  - From md: "Create more" at the left (create sheets), then Cancel with its
 *    Esc keycap and the primary with ⌘↵, at the bottom right.
 *  - Below md: one full-width primary above the safe area and the keyboard;
 *    the header's X is the way out, so Cancel and Create more drop.
 *  - A form-level refusal is one `--danger` line above the buttons.
 *
 * It opens with focus in the first empty field, and ⌘↵ submits from any
 * field. It compares `values` with what it opened with: Cancel, X and Esc
 * close at once when nothing changed and ask when something did, with two
 * buttons, "Keep editing" and "Discard changes" (forms 2.11). While dirty it
 * also holds the LeaveGuard, so a back link or the sidebar asks first.
 * Success is the caller's: close it (focus goes back to what opened it) and
 * toast, or, with Create more on, clear the fields and stay.
 *
 *   <FormSheet title="New task" isOpen={open} onOpenChange={setOpen} primary="Create task"
 *     values={values} discardTitle="Discard the new task?" pending={pending} error={error}
 *     onSubmit={() => run(() => createTask(values), { failure: "inline", succeeded: () => setOpen(false) })}>
 *     <FormField label="Title">{(p) => <Input {...p} value={values.title} onChange={…} />}</FormField>
 *   </FormSheet>
 *
 * Pickers inside it (`Select`, `Combobox`, `DatePicker`, the entity pickers)
 * open through PickerLayer: a popover with a mouse, and on touch a SheetView
 * with a back arrow beside the X, never a second sheet. A refusal comes back
 * on its fields (`fieldErrors`) and the first of them takes focus; a fact's
 * one-field sheet uses `discard="silent"`.
 */
export function FormSheet({
  title,
  isOpen,
  onOpenChange,
  onSubmit,
  primary,
  pending = false,
  error,
  primaryDisabled = false,
  disabledReason,
  createMore,
  values,
  dirty: dirtyProp,
  discardTitle = "Discard changes?",
  leaveTitle = "Leave without saving?",
  discard = "ask",
  fieldErrors,
  size,
  fullHeight,
  surface,
  className,
  children,
}: FormSheetProps) {
  const formId = useId();
  const mod = useModKey();
  const json = stableJson(values ?? null);

  // What the values were when the sheet opened, taken again each time it opens.
  const [opened, setOpened] = useState<string | null>(isOpen ? json : null);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    setOpened(isOpen ? json : null);
  }
  const dirty = isOpen && (dirtyProp ?? (opened !== null && json !== opened));

  const [asking, setAsking] = useState(false);
  if (asking && (!isOpen || !dirty)) setAsking(false);

  // A one-field sheet is modal and short-lived: nothing to hold the page's links for.
  useHoldLeave(dirty && discard === "ask" ? { title: leaveTitle, stay: "Keep editing" } : null);

  function close() {
    if (pending) return;
    onOpenChange(false);
  }
  function requestClose() {
    if (pending) return;
    if (dirty && discard === "ask") setAsking(true);
    else onOpenChange(false);
  }

  const formRef = useRef<HTMLFormElement>(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || primaryDisabled) return;
    const form = e.currentTarget;
    marked.current = new Set();
    onSubmit(new FormData(form), form);
    // A check that failed in onSubmit has marked its fields by the next frame.
    requestAnimationFrame(() => focusFirstInvalid(form));
  }

  // A refusal that came back from the server marks its fields; the first one takes focus. Only a field
  // that newly has a line moves it: fixing one never throws focus onto the next, and a Save pressed again
  // starts the count over, so the same refusal moves focus again.
  const errorKey = fieldErrors ? Object.keys(fieldErrors).join("|") : "";
  const marked = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const keys = errorKey ? errorKey.split("|") : [];
    const added = keys.some((k) => !marked.current.has(k));
    marked.current = new Set(keys);
    if (!added) return;
    const frame = requestAnimationFrame(() => focusFirstInvalid(formRef.current));
    return () => cancelAnimationFrame(frame);
  }, [errorKey]);

  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.requestSubmit();
    }
  }

  return (
    <>
      <Sheet
        title={title}
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        isDismissable={!pending}
        dirty={dirty || pending}
        onDirtyClose={discard === "ask" ? requestClose : undefined}
        size={size}
        fullHeight={fullHeight}
        surface={surface}
        className={className}
        footer={
          <div className="space-y-3">
            {error && <SaveError>{error}</SaveError>}
            <div className="flex items-center gap-2">
              {createMore && (
                <Switch
                  label="Create more"
                  isSelected={createMore.isSelected}
                  onChange={createMore.onChange}
                  className="mr-auto w-auto max-md:hidden"
                />
              )}
              <Button
                type="button"
                variant="secondary"
                className={cn("max-md:hidden", !createMore && "ml-auto")}
                onClick={requestClose}
                aria-keyshortcuts="Escape"
              >
                Cancel
                <Kbd aria-hidden="true">Esc</Kbd>
              </Button>
              <Button
                type="submit"
                form={formId}
                pending={pending}
                disabled={primaryDisabled}
                className="max-md:flex-1"
                aria-keyshortcuts="Meta+Enter Control+Enter"
              >
                {primary}
                <Kbd tone="act" aria-hidden="true">
                  {shortcutLabel(mod, "↵")}
                </Kbd>
              </Button>
            </div>
            {primaryDisabled && disabledReason && (
              <p className="truncate text-meta text-fg-3 md:text-right">{disabledReason}</p>
            )}
          </div>
        }
      >
        <FormBody formId={formId} formRef={formRef} isOpen={isOpen} onSubmit={submit} onKeyDown={onKeyDown}>
          {children}
        </FormBody>
      </Sheet>
      {asking && (
        <ConfirmDialog
          title={discardTitle}
          cancelLabel="Keep editing"
          onClose={() => setAsking(false)}
          actions={
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setAsking(false);
                onOpenChange(false);
              }}
            >
              Discard changes
            </Button>
          }
        />
      )}
    </>
  );
}

/**
 * Moves focus to the first field a check marked invalid (`aria-invalid`) and
 * scrolls it to the middle of the view, so a refusal is seen where it is, not
 * at the top of the form (forms 2.0). Does nothing when no field is marked.
 */
export function focusFirstInvalid(root: ParentNode | null): void {
  const bad = root?.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!bad) return;
  bad.focus({ preventScroll: true });
  bad.scrollIntoView({ block: "center", behavior: "auto" });
}

/** The form inside the sheet's body: focus goes to the first empty field once it shows. */
function FormBody({
  formId,
  formRef: ref,
  isOpen,
  onSubmit,
  onKeyDown,
  children,
}: {
  formId: string;
  formRef: RefObject<HTMLFormElement | null>;
  isOpen: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!isOpen) return;
    // After the dialog's own focus move, which lands on the dialog itself.
    const frame = requestAnimationFrame(() => {
      const form = ref.current;
      if (!form || form.contains(document.activeElement)) return;
      const fields = [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(firstEmptyField)];
      const first = fields.find((f) => f.value === "") ?? fields[0];
      first?.focus();
      // A field that already holds text (a fact's one-field sheet) opens with the caret after it, so typing adds to it.
      try {
        if (first?.value) first.setSelectionRange(first.value.length, first.value.length);
      } catch {
        // Some input types (email, number) have no selection to set.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, ref]);
  return (
    <form ref={ref} id={formId} noValidate onSubmit={onSubmit} onKeyDown={onKeyDown} className="space-y-4 p-4">
      {children}
    </form>
  );
}
