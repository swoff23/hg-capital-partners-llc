"use client";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormSheet } from "@/components/form-sheet";
import { useHoldLeave } from "@/components/leave-guard";
import { useDraft } from "@/components/use-draft";
import { shortcutLabel, useModKey } from "@/components/use-platform";
import { useRun } from "@/components/use-run";
import { Button, Kbd, PageHeader, SaveError, textLinkClass } from "@/components/ui";
import type { ActionResult, FieldErrors } from "@/lib/action-result";
import { draftLabel, stableJson } from "@/lib/drafts";
import { cn } from "@/lib/utils";

/**
 * Shows an intercepted create sheet only while the URL is still its own.
 * The `@modal` slot keeps its last page through a soft navigation to a route
 * it doesn't match (Next's parallel routes guide), so a sheet left open would
 * stay over wherever the person went next; this lets go of it, state and all,
 * the moment the path moves on. (The guide's fix, a catch-all page in the slot,
 * would also make every path look like a page to the `no-html-link-for-pages`
 * lint rule, which then asks for a `<Link>` to API routes.) Used by the
 * intercepting pages in `app/(app)/@modal`.
 */
export function SheetRoute({ path, children }: { path: string; children: ReactNode }) {
  const pathname = usePathname();
  return pathname === path ? children : null;
}

/** What the form hands the fields it holds. */
export type CreateFormContext = {
  /**
   * Each field's own line (forms 2.0): the server's zod failure and this
   * form's `check`, less any field typed in since. Keyed by the field's name.
   */
  errors: FieldErrors;
  /** The person typed in this field: its line goes, and the field re-checks as the next try. */
  clear: (name: string) => void;
  pending: boolean;
};

export type CreateFormProps<V, R> = {
  /**
   * "sheet" is the intercepted route: a `FormSheet` over the page, with
   * Create more. "page" is the same form flat on its own page, for a pasted
   * link or a reload (forms 3, "keep their URLs").
   */
  variant: "sheet" | "page";
  /** "New task". The sheet's title, and the page's h1. */
  title: string;
  /** The primary, naming what it does: "Create task". */
  primary: string;
  /** The question Cancel, X or Esc ask once something changed: "Discard the new task?". */
  discardTitle: string;
  /** The question a link asks while it's dirty: "Leave without saving the new task?". */
  leaveTitle: string;
  /** Where Cancel goes on the page version, which has no sheet to close ("/tasks"). */
  backHref: string;
  /** The fields' values (JSON), controlled by the caller: the dirty compare and the draft. */
  values: V;
  /** Puts a restored draft back into the caller's state. */
  onRestore: (draft: V) => void;
  /** Starts the fields over, keeping the caller's context: Clear on the draft line, and a success with Create more on. */
  onReset: () => void;
  /** The draft's key: the editor and its context ("new-task:p_1"). The draft clears on a success and on Discard. */
  draftKey: string;
  /** The names of the fields that show their own line. Any other failure line goes above the primary. */
  fields: readonly string[];
  /**
   * Runs on submit before anything is sent, with the form's fields: a
   * line per field that needs one ("Enter the address."), or null to go on.
   * Focus moves to the first of them.
   */
  check?: (data: FormData) => FieldErrors | null;
  /** The server action, called with the form's named fields. */
  action: (data: FormData) => Promise<ActionResult<R>>;
  /**
   * The action succeeded. Toast and, unless `more` (Create more is on),
   * leave: `router.back()` to stay where you were, or `router.replace(href)`
   * to open the record. With `more` the form has already started over.
   */
  onCreated: (data: R, more: boolean) => void;
  /** Offer "Create more" in the sheet's footer. */
  createMore?: boolean;
  size?: "md" | "lg";
  fullHeight?: boolean;
  children: (ctx: CreateFormContext) => ReactNode;
};

/**
 * A create form in two shapes (forms 2.9, 2.11, 2.12; build plan F2): the
 * sheet an intercepting route opens over the page, and the flat page a
 * pasted link or a reload gets. One body, so what you can do at 1280 you can
 * do from a link. It owns what every create shares:
 *
 *  - the draft: what's typed is kept in this browser (`useDraft`) and comes
 *    back with "Draft from 2:10 PM · Clear" over the fields; a success, a
 *    Discard and Clear throw it away;
 *  - the save: `useRun` with failures shown in place, never as a toast or
 *    the error page. A zod failure puts its line on the field that caused
 *    it and moves focus there; a refusal that belongs to no field is one
 *    `--danger` line above the primary;
 *  - leaving: Cancel, X and Esc close at once when nothing changed and ask
 *    with two buttons when something did; a dirty form holds the LeaveGuard.
 *
 * The caller owns the fields, which post under their `name`s as the server
 * action reads them, and what a success means (the toast, where to go).
 *
 *   <CreateForm variant="sheet" title="New task" primary="Create task" … action={createTask} onCreated={…}>
 *     {({ errors, clear }) => <FormField label="Title" error={errors.title}>{(p) => <Input {...p} name="title" … />}</FormField>}
 *   </CreateForm>
 */
export function CreateForm<V, R>({
  variant,
  title,
  primary,
  discardTitle,
  leaveTitle,
  backHref,
  values,
  onRestore,
  onReset,
  draftKey,
  fields,
  check,
  action,
  onCreated,
  createMore = false,
  size,
  fullHeight,
  children,
}: CreateFormProps<V, R>) {
  const router = useRouter();
  const { run, pending, error, fieldErrors } = useRun();
  const { restored, savedAt, clear: clearDraft } = useDraft(draftKey, values);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState(true);
  const [asking, setAsking] = useState(false);
  // A restored draft is put back once, and the line over the fields says so until it's cleared.
  const [restoredAt, setRestoredAt] = useState<Date | null>(null);
  const put = useRef(false);
  const restoreInto = useRef(onRestore);
  useEffect(() => {
    restoreInto.current = onRestore;
  });
  useEffect(() => {
    if (!restored || put.current) return;
    put.current = true;
    restoreInto.current(restored);
    setRestoredAt(savedAt);
  }, [restored, savedAt]);

  // The lines on the fields: the form's own check, then the server's, less the ones typed in since.
  const [checked, setChecked] = useState<FieldErrors>({});
  const [typedIn, setTypedIn] = useState<readonly string[]>([]);
  const shown: FieldErrors = Object.fromEntries(
    Object.entries({ ...fieldErrors, ...checked }).filter(([name]) => !typedIn.includes(name)),
  );
  const ctx: CreateFormContext = {
    errors: shown,
    clear: (name) => setTypedIn((names) => (names.includes(name) ? names : [...names, name])),
    pending,
  };
  // Failures with no field of their own go above the primary; a failure the fields already show adds nothing.
  const unplaced = Object.entries(shown).filter(([name]) => !fields.includes(name));
  const formError =
    unplaced.length > 0 ? unplaced.map(([, line]) => line).join(" ") : fieldErrors === undefined ? error : undefined;

  // The first field with a line gets focus, scrolled to the middle (forms 2.0, Timing).
  const body = useRef<HTMLDivElement>(null);
  const errorNames = Object.keys(shown).join("|");
  useEffect(() => {
    if (!errorNames) return;
    const first = body.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    first?.focus({ preventScroll: true });
    first?.scrollIntoView({ block: "center" });
  }, [errorNames]);

  // What the fields held when the form opened; a restored draft or any typing makes it differ.
  const [baseline] = useState(() => stableJson(values));
  const dirty = stableJson(values) !== baseline;

  // The page version holds the LeaveGuard itself; FormSheet holds it for the sheet.
  useHoldLeave(variant === "page" && dirty ? { title: leaveTitle, stay: "Keep editing" } : null);

  function leave() {
    clearDraft();
    setOpen(false);
    if (variant === "sheet") router.back();
    else router.push(backHref);
  }

  function submit(data: FormData) {
    setTypedIn([]);
    const bad = check?.(data) ?? null;
    if (bad && Object.keys(bad).length > 0) {
      setChecked(bad);
      return;
    }
    setChecked({});
    run(() => action(data), {
      failure: "inline",
      succeeded: (created) => {
        clearDraft();
        setRestoredAt(null);
        put.current = true;
        const again = variant === "sheet" && more;
        if (again) {
          onReset();
          // The next one starts in its first field.
          requestAnimationFrame(() =>
            body.current?.querySelector<HTMLElement>("input:not([type='hidden']):not([disabled]), textarea:not([disabled])")?.focus(),
          );
        }
        onCreated(created, again);
      },
    });
  }

  const fieldsBody = (
    <div ref={body} className="space-y-4">
      {restoredAt && (
        <p className="truncate text-meta text-fg-3">
          {draftLabel(restoredAt)}.{" "}
          <button
            type="button"
            className={cn(textLinkClass, "rounded-sm pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center")}
            onClick={() => {
              clearDraft();
              setRestoredAt(null);
              setChecked({});
              setTypedIn([]);
              onReset();
            }}
          >
            Clear
          </button>
        </p>
      )}
      {children(ctx)}
    </div>
  );

  if (variant === "sheet") {
    return (
      <FormSheet
        title={title}
        isOpen={open}
        onOpenChange={(next) => {
          if (!next) leave();
        }}
        onSubmit={submit}
        primary={primary}
        pending={pending}
        error={formError}
        createMore={createMore ? { isSelected: more, onChange: setMore } : undefined}
        values={values}
        discardTitle={discardTitle}
        leaveTitle={leaveTitle}
        size={size}
        fullHeight={fullHeight}
      >
        {fieldsBody}
      </FormSheet>
    );
  }

  return (
    <PageBody
      title={title}
      primary={primary}
      pending={pending}
      error={formError}
      dirty={dirty}
      asking={asking}
      setAsking={setAsking}
      discardTitle={discardTitle}
      onSubmit={submit}
      onLeave={leave}
    >
      {fieldsBody}
    </PageBody>
  );
}

/** The page version: the h1, the fields flat on the page, the error line and the buttons under them. */
function PageBody({
  title,
  primary,
  pending,
  error,
  dirty,
  asking,
  setAsking,
  discardTitle,
  onSubmit,
  onLeave,
  children,
}: {
  title: string;
  primary: string;
  pending: boolean;
  error?: string;
  dirty: boolean;
  asking: boolean;
  setAsking: (asking: boolean) => void;
  discardTitle: string;
  onSubmit: (data: FormData) => void;
  onLeave: () => void;
  children: ReactNode;
}) {
  const mod = useModKey();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pending) onSubmit(new FormData(e.currentTarget));
  }
  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.requestSubmit();
    }
  }
  return (
    // A form on the page itself, no card around it (section 9, Cards and sections).
    <div className="max-w-xl">
      <PageHeader title={title} />
      <form noValidate onSubmit={submit} onKeyDown={onKeyDown} className="space-y-4">
        {children}
        <div className="space-y-3">
          {error && <SaveError>{error}</SaveError>}
          <div className="flex items-center gap-2">
            <Button type="submit" pending={pending} aria-keyshortcuts="Meta+Enter Control+Enter">
              {primary}
              <Kbd aria-hidden="true">{shortcutLabel(mod, "↵")}</Kbd>
            </Button>
            <Button type="button" variant="secondary" onClick={() => (dirty ? setAsking(true) : onLeave())}>
              Cancel
            </Button>
          </div>
        </div>
      </form>
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
                onLeave();
              }}
            >
              Discard changes
            </Button>
          }
        />
      )}
    </div>
  );
}
