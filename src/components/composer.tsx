"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { Camera, ImagePlus, Lock } from "lucide-react";
import {
  MediaUploadTray,
  UploadTile,
  useMediaUploader,
  useUndoableRemove,
  type MediaUpload,
  type MediaUploaderApi,
  type MediaUploaderOptions,
  type MediaUploaderTargetOptions,
} from "@/components/media-uploader";
import { SegmentedControl } from "@/components/segmented-control";
import { useToast, useToastInset } from "@/components/toast";
import { DropLabel, useDropTarget, type DropTargetState, type UploadTarget } from "@/components/upload-queue";
import { Button, Kbd, buttonClass } from "@/components/ui";
import { useKeyboardInset } from "@/components/use-keyboard-inset";
import { shortcutLabel, useModKey } from "@/components/use-platform";
import { callAction, OFFLINE_ERROR, type ActionResult } from "@/lib/action-result";
import { fileKindForType, uploadContentType } from "@/lib/attachments/content-types";
import { EMPTY_DRAFT, adoptSharedDraft, clientIdToReuse, parseDraft, resolvePending, serializeDraft, type Draft } from "@/lib/composer-draft";
import { cn } from "@/lib/utils";

/*
 * The one composer (docs/specs/activity-comments.md 2.7): the staff task page
 * (through the thin wrapper in app/(app)/tasks/[id]/composer.tsx), the
 * contractor's job page and the deal page's note box. Each caller owns its
 * wiring: what Send posts (`onSend`), the uploads and the audience copy.
 */

export type ComposerVisibility = "SHARED" | "INTERNAL";

/** What Send hands the caller. */
export interface ComposerMessage {
  body: string;
  /** "SHARED" whenever the composer has no switch. */
  visibility: ComposerVisibility;
  /** Ready files going out with it, oldest first. */
  attachmentIds: string[];
  /**
   * Made in the browser for this send, so a Retry of a send that did post
   * never posts twice (activity 2.7, `TaskEvent.data.clientId`). The same
   * message keeps the same id through every Retry.
   */
  clientId: string;
}

/** A file that's uploaded and waiting to go out with the message. */
export type ComposerDraft = { id: string; filename: string };

/** The composer's uploads: where files go, the ones already waiting, how one is taken back. */
export interface ComposerUploader {
  /**
   * The upload kind, row and record step, as useMediaUploader takes them. A
   * queue `target` also makes the page a drop target (uploads 2.2): files
   * dropped or pasted anywhere in the composer's zone, or on the composer,
   * land in its tray.
   */
  options: MediaUploaderOptions | MediaUploaderTargetOptions;
  /** Files uploaded on an earlier visit and not sent yet, oldest first. */
  drafts: readonly ComposerDraft[];
  /** Takes a ready file back before it's sent. */
  remove: (draft: ComposerDraft) => Promise<ActionResult<unknown>>;
  /** The gated URL a ready photo's tile shows. */
  fileUrl: (id: string) => string;
}

export interface ComposerProps {
  /**
   * Where the draft lives in this browser, one key per surface, record and
   * person (composer-draft.ts personalDraftKey), so a staff draft never
   * opens in the portal's composer on the same origin, and a second person
   * on a shared device never opens another's.
   */
  draftKey: string;
  /**
   * Who will see it, as one line over the field for each side of the switch
   * ("Zack sees this and gets an email"; "Only Connor and Pieter see this",
   * shown with the Lock). A node, so a long first name can truncate while the
   * fixed words stay (AudienceText). None for the deal note box.
   */
  audience?: { shared?: ReactNode; internal?: ReactNode } | null;
  /** "switch": Shared | Internal before Send. "none": always Shared (the portal) or no audience (deal notes). */
  visibility?: "switch" | "none";
  /** Photos, videos and files; none for the deal note box. */
  uploader?: ComposerUploader | null;
  /** Posts the message; the draft and the files stay until it answers ok. */
  onSend: (message: ComposerMessage) => Promise<ActionResult<unknown>>;
  /** "phone": below md the composer sits on the bottom edge. "never": inline at every size. */
  pin?: "phone" | "never";
  /**
   * For an inline composer on a page with a fixed bar over its foot (the
   * portal's ActionBar): how much of the page's bottom that bar covers, as a
   * CSS length ("7rem"). On focus and after a send the box scrolls to sit
   * above it, so what was typed and what was sent never end up underneath.
   */
  clearance?: string;
  /**
   * Placeholder per side: "Reply to Zack" or "Add a comment"; "Add an internal
   * note", which shortens to `internalShort` ("Internal note") below 480px.
   */
  placeholders: { shared: string; internal?: string; internalShort?: string };
  /** Send's label per side: "Send"; "Add note" for an Internal note or a deal note. */
  sendLabel?: { shared?: string; internal?: string };
  /**
   * The `clientId`s of the messages the page already holds. After a reload, a
   * message that was mid-send is dropped when it is in here (it did post) and
   * brought back into the field when it isn't, so nothing is lost and
   * nothing doubles.
   */
  sentClientIds?: readonly string[];
  /** What a drop onto the target says: "Drop to add to this reply" and "Drop to add to this note" by the switch. */
  dropLabel?: { shared?: string; internal?: string };
  /**
   * Files the page holds outside the composer's own uploader, going out with
   * the next Send: the job page's, where photos picked from its bar wait while
   * there's text in the box and go with it (uploads 2.7). Their ids lead the
   * message's `attachmentIds` and let Send post them without words; `tray`
   * draws inside the box, over the field (the page's upload tray and its
   * "2 uploads ready to send"). The page takes them back when Send answers,
   * so use it without a PendingSendsProvider.
   */
  held?: { ids: readonly string[]; tray?: ReactNode } | null;
  /**
   * The words in the box as they change, a draft restored from this browser
   * included: the job page tells an empty composer, where photos post on their
   * own, from one being written in.
   */
  onTextChange?: (text: string) => void;
}

/* ---------------- Words that name who sees it ---------------- */

/**
 * One line of the audience copy: a first name that truncates before the line
 * could wrap, then the fixed words, which don't ("Maximilian… sees this and
 * gets an email"). Without a name, just the words.
 */
export function AudienceText({ name, words }: { name?: string | null; words: string }) {
  if (!name) return <span className="min-w-0 truncate">{words}</span>;
  return (
    <span className="flex min-w-0">
      <span className="min-w-0 truncate">{name}</span>
      <span className="shrink-0 whitespace-pre">{` ${words}`}</span>
    </span>
  );
}

/* ---------------- Draft, kept per key in this browser ---------------- */

// Read through useSyncExternalStore so the server render and hydration see
// an empty box and the saved draft appears right after. Memory backs it up
// when storage is off (private windows). A draft in today's text-only format
// is read as Internal and written back in the new one, and the first read of
// a task page key takes over the draft its shared key held (adoptSharedDraft).
const drafts = new Map<string, Draft>();
const listeners = new Set<() => void>();

function persist(key: string, d: Draft) {
  try {
    const raw = serializeDraft(d);
    if (raw) localStorage.setItem(key, raw);
    else localStorage.removeItem(key);
  } catch {}
}

function readDraft(key: string): Draft {
  let d = drafts.get(key);
  if (!d) {
    let raw: string | null = null;
    try {
      adoptSharedDraft(localStorage, key);
      raw = localStorage.getItem(key);
    } catch {}
    const parsed = parseDraft(raw);
    d = parsed.draft;
    if (parsed.legacy) persist(key, d);
    drafts.set(key, d);
  }
  return d;
}

function writeDraft(key: string, patch: Partial<Draft>) {
  const next = { ...readDraft(key), ...patch };
  drafts.set(key, next);
  persist(key, next);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Below 480px, where the Internal placeholder shortens. */
const NARROW = "(max-width: 29.99rem)";

function subscribeNarrow(onChange: () => void) {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** The end of the page, at once: the bar below it has just grown or the keyboard has come up. */
function scrollToEnd() {
  const root = document.scrollingElement;
  if (root) root.scrollTop = root.scrollHeight;
}

function newClientId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

/* ---------------- Messages in flight, shown on the timeline ---------------- */

/**
 * A message sent and not yet in the page's events (activity 2.7). It shows at
 * the end of the timeline the moment Send is pressed ("Sending…" after
 * 200ms), stays there if it fails with a Retry line, and goes when the page
 * holds the real event (its `clientId`).
 */
export interface PendingSend {
  clientId: string;
  body: string;
  visibility: ComposerVisibility;
  files: readonly ComposerDraft[];
  /** When Send was pressed (ISO). */
  at: string;
  status: "sending" | "sent" | "failed";
  /** Why a failed send failed, as callAction said it. */
  error?: string;
  /** Send the same message again, with the same `clientId`. */
  retry: () => void;
  /** Take the text and files back into the composer. */
  edit: () => void;
  /** Throw it away. */
  discard: () => void;
}

export interface PendingSendsApi {
  /** The signed-in person's name, for the card. */
  author: string;
  sends: readonly PendingSend[];
  begin: (send: PendingSend) => void;
  update: (clientId: string, patch: Partial<PendingSend>) => void;
  remove: (clientId: string) => void;
}

const PendingSendsContext = createContext<PendingSendsApi | null>(null);

/**
 * Wrap the timeline and the composer in this and a send shows in place:
 * optimistic, with a failed state that keeps the message and offers Retry.
 * Without it the composer keeps today's behavior (the field holds the message
 * until the server says ok, and a failure toasts).
 */
export function PendingSendsProvider({ author, children }: { author: string; children: ReactNode }) {
  const [sends, setSends] = useState<readonly PendingSend[]>([]);
  const api = useMemo<PendingSendsApi>(
    () => ({
      author,
      sends,
      begin: (send) => setSends((all) => [...all.filter((s) => s.clientId !== send.clientId), send]),
      update: (clientId, patch) => setSends((all) => all.map((s) => (s.clientId === clientId ? { ...s, ...patch } : s))),
      remove: (clientId) => setSends((all) => all.filter((s) => s.clientId !== clientId)),
    }),
    [author, sends],
  );
  return <PendingSendsContext value={api}>{children}</PendingSendsContext>;
}

/** The messages in flight, or null outside a PendingSendsProvider. */
export function usePendingSends(): PendingSendsApi | null {
  return useContext(PendingSendsContext);
}

/* ---------------- The drop zone ---------------- */

type ZoneApi = {
  ref: RefObject<HTMLDivElement | null>;
  report: (drop: { state: DropTargetState; label: string } | null) => void;
};
const ZoneContext = createContext<ZoneApi | null>(null);

/**
 * The area files can be dropped on (uploads 2.2): on the task page the whole
 * main column. Anything dropped or pasted inside it goes to the composer's
 * tray, so nothing posts without Send. While a file is dragged over the
 * window the zone takes the drop edge, and under the pointer the label
 * ("Drop to add to this reply"). The composer registers itself as the
 * target; with no zone around it, the composer box is the target.
 */
export function ComposerDropZone({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState<{ state: DropTargetState; label: string } | null>(null);
  const api = useMemo<ZoneApi>(() => ({ ref, report: setDrop }), []);
  return (
    <ZoneContext value={api}>
      <div ref={ref} className={cn("relative", className)}>
        {children}
        {drop && <DropLabel state={drop.state} label={drop.label} />}
      </div>
    </ZoneContext>
  );
}

/* ---------------- Composer ---------------- */

const NONE: readonly ComposerDraft[] = [];
const NO_IDS: readonly string[] = [];

/**
 * Write a reply, a note or an update: text, and with an uploader photos,
 * videos and documents. Files upload as they're picked, dropped or pasted
 * and go out with the message; Send waits for them. Cmd or Ctrl+Enter
 * sends, printed inside Send at its trailing edge for a mouse ("Send ⌘↵").
 * A line over the field says who will see it, and with the switch, Internal
 * turns the box --fill-1 under a Lock line (docs/brand-guidelines.md, section
 * 9); the text and the choice are kept together, and Send reads "Add note".
 * Esc leaves the field and keeps the draft. Pinned on a phone, it sits on the
 * bottom edge with its contents on the 16px page gutter, rides above the
 * keyboard, and shows its tools while you write. Send is secondary, so it
 * never competes with a page's one primary (the Review banner's Approve, a
 * deal's stage).
 */
export function Composer(props: ComposerProps) {
  if (props.uploader) return <UploadingComposer {...props} uploader={props.uploader} />;
  return <ComposerBody {...props} uploader={null} api={null} added={NONE} target={null} />;
}

/** With uploads: the uploader's hook lives here, so a composer without one never starts it. */
function UploadingComposer(props: ComposerProps & { uploader: ComposerUploader }) {
  // Recorded here but not yet in `drafts` (the page catches up after the refresh).
  const [added, setAdded] = useState<ComposerDraft[]>([]);
  const { options } = props.uploader;
  // The queue's owner goes on to the record step untouched (queue-owner.ts), so the server can refuse a tab left
  // signed in as someone else.
  const recordedHere = (record: MediaUploaderOptions["record"]) => async (file: Parameters<MediaUploaderOptions["record"]>[0], owner?: string) => {
    const res = await record(file, owner);
    if (res.ok && res.data) {
      const recorded = { id: res.data.id, filename: file.filename };
      setAdded((r) => [...r, recorded]);
    }
    return res;
  };
  const target: UploadTarget | null = "target" in options ? { ...options.target, record: recordedHere(options.target.record) } : null;
  const api = useMediaUploader(
    "target" in options && target ? { ...options, target } : { ...(options as MediaUploaderOptions), record: recordedHere((options as MediaUploaderOptions).record) },
  );
  return <ComposerBody {...props} api={api} added={added} target={target} />;
}

function ComposerBody({
  draftKey,
  audience,
  visibility: mode = "switch",
  uploader,
  onSend,
  pin = "phone",
  clearance,
  placeholders,
  sendLabel,
  sentClientIds,
  dropLabel,
  held,
  onTextChange,
  api,
  added,
  target,
}: ComposerProps & {
  uploader: ComposerUploader | null;
  api: MediaUploaderApi | null;
  added: readonly ComposerDraft[];
  target: UploadTarget | null;
}) {
  const { toast } = useToast();
  const draft = useSyncExternalStore(
    subscribe,
    () => readDraft(draftKey),
    () => EMPTY_DRAFT,
  );
  const text = draft.text;
  const visibility = mode === "switch" ? draft.visibility : "SHARED";
  const mod = useModKey();
  const sends = usePendingSends();
  const zone = useContext(ZoneContext);
  const undoable = useUndoableRemove();
  // Ids sent or removed, which a stale `drafts` mustn't bring back.
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const waiting = uploader?.drafts ?? [];
  const ready = [...waiting, ...added.filter((a) => !waiting.some((d) => d.id === a.id))].filter((r) => !gone.has(r.id));
  const forget = (ids: readonly string[]) => setGone((g) => new Set([...g, ...ids]));
  const unforget = (ids: readonly string[]) => setGone((g) => new Set([...g].filter((id) => !ids.includes(id))));
  const [sendingNow, setSendingNow] = useState(false);
  const [focused, setFocused] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const internal = mode === "switch" && visibility === "INTERNAL";
  const pinned = pin === "phone";
  // What was sent, by clientId, so Retry and Edit can use it again.
  const sent = useRef(new Map<string, { message: ComposerMessage; files: ComposerDraft[] }>());
  // Timers for scrolling a moment after a change (the keyboard, the page refreshing), cleared with the box.
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((t) => window.clearTimeout(t));
  }, []);
  const later = (ms: number, fn: () => void) => void timers.current.push(window.setTimeout(fn, ms));
  // While true the end of the page is kept in view as the bar grows (a focus at the end of Activity on a phone).
  const stickToEnd = useRef(false);

  const setText = (next: string) => {
    // Words changed after a failed send are a different message: the id kept for the failed one is let go.
    const kept = readDraft(draftKey).pending;
    writeDraft(draftKey, { text: next, ...(kept?.held && kept.text !== next ? { pending: null } : {}) });
  };
  const setVisibility = (v: ComposerVisibility) => writeDraft(draftKey, { visibility: v });
  const heldIds = held?.ids ?? NO_IDS;

  // Tell the page what's in the box, a restored draft included. The latest callback, without re-running on each render.
  const textChanged = useRef(onTextChange);
  useLayoutEffect(() => {
    textChanged.current = onTextChange;
  });
  useEffect(() => {
    textChanged.current?.(text);
  }, [text]);

  // Grow with the text, up to the cap in CSS, and again when the field's width changes (Send grows a spinner and the
  // field narrows, so the words wrap onto another line that would otherwise sit clipped under the box's edge).
  const grow = useCallback(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useLayoutEffect(grow, [grow, text]);
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    let width = el.offsetWidth;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      if (el.offsetWidth === width) return;
      width = el.offsetWidth;
      // On the next frame, not inside the callback: setting the field's height there resizes what is being observed
      // and Safari reports "ResizeObserver loop completed with undelivered notifications".
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(grow);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [grow]);

  // On a phone the composer is pinned to the bottom edge: it rides above the keyboard, and toasts stay above it.
  useKeyboardInset();
  const [inset, setInset] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      setInset(getComputedStyle(el).position === "sticky" ? el.offsetHeight : 0);
      // The bar just grew over the last entry: scroll the page to its end so the entry sits above it.
      if (stickToEnd.current) scrollToEnd();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // The keyboard rising moves the bar too.
    const vv = window.visualViewport;
    const keyboard = () => {
      if (stickToEnd.current) scrollToEnd();
    };
    vv?.addEventListener("resize", keyboard);
    return () => {
      ro.disconnect();
      vv?.removeEventListener("resize", keyboard);
    };
  }, []);

  // A message that was mid-send when the page went away: dropped if it did post, back in the field if it didn't.
  const restored = useRef<string | null>(null);
  useEffect(() => {
    if (restored.current === draftKey) return;
    restored.current = draftKey;
    const outcome = resolvePending(readDraft(draftKey), sentClientIds ?? []);
    if (outcome.action === "drop") writeDraft(draftKey, { pending: null });
    else if (outcome.action === "restore") writeDraft(draftKey, outcome.draft);
  }, [draftKey, sentClientIds]);

  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
  const placeholder = internal
    ? narrow && placeholders.internalShort
      ? placeholders.internalShort
      : (placeholders.internal ?? placeholders.shared)
    : placeholders.shared;
  const label = internal ? (sendLabel?.internal ?? "Send") : (sendLabel?.shared ?? "Send");
  const audienceLine = internal ? audience?.internal : audience?.shared;

  // Files can be dropped or pasted anywhere in the zone (or on the composer, with no zone around it).
  const dropState = useDropTarget(target, zone?.ref ?? box, {
    label: internal ? (dropLabel?.internal ?? "Drop to add to this note") : (dropLabel?.shared ?? "Drop to add to this reply"),
  });
  const dropText = internal ? (dropLabel?.internal ?? "Drop to add to this note") : (dropLabel?.shared ?? "Drop to add to this reply");
  const report = zone?.report;
  useEffect(() => {
    report?.({ state: { active: dropState.active, over: dropState.over }, label: dropText });
    return () => report?.(null);
  }, [report, dropState.active, dropState.over, dropText]);

  const pendingUploads = api?.pending ?? 0;
  const canSend = !sendingNow && pendingUploads === 0 && (text.trim().length > 0 || ready.length > 0 || heldIds.length > 0);

  /** One try at posting, for a first Send and a Retry alike. True when it posted. */
  async function post(message: ComposerMessage): Promise<boolean> {
    const res = await callAction(() => onSend(message));
    if (res.ok) {
      if (readDraft(draftKey).pending?.clientId === message.clientId) writeDraft(draftKey, { pending: null });
      sends?.update(message.clientId, { status: "sent", error: undefined });
      sent.current.delete(message.clientId);
      return true;
    }
    // On a timeline the card stays with its Retry, and the text stays in the draft's pending slot until it posts.
    // Without one, a toast says why, and the field still holds the message.
    if (sends) sends.update(message.clientId, { status: "failed", error: res.error });
    else toast({ message: res.error });
    return false;
  }

  function send() {
    if (!canSend) return;
    const attachmentIds = [...heldIds, ...ready.map((r) => r.id)];
    const side: ComposerVisibility = internal ? "INTERNAL" : "SHARED";
    const message: ComposerMessage = {
      body: text,
      visibility: side,
      attachmentIds,
      // The same message after a failure keeps its id, so a send that did post is recognised and not posted twice.
      clientId: clientIdToReuse(readDraft(draftKey), { body: text, visibility: side, attachmentIds }) ?? newClientId(),
    };
    const files = [...ready];
    sent.current.set(message.clientId, { message, files });
    if (!sends) {
      // No timeline to show it on: the draft and the files stay until it's sent, so a failure loses nothing.
      setSendingNow(true);
      // The id is written before the call: a failure, or a page closed mid-send, keeps it for the next Send.
      writeDraft(draftKey, {
        pending: {
          clientId: message.clientId,
          text,
          visibility: side,
          files: attachmentIds.map((id) => ({ id, filename: files.find((f) => f.id === id)?.filename ?? "" })),
          at: new Date().toISOString(),
          held: true,
        },
      });
      void post(message).then((ok) => {
        setSendingNow(false);
        if (!ok) return;
        writeDraft(draftKey, { text: "" });
        forget(files.map((f) => f.id));
        // The page refreshes with the new entry above the box: bring the box back into view.
        revealBox();
      });
      return;
    }
    const at = new Date().toISOString();
    // The words move to the pending slot at once and leave it only on success; the field is free for the next message.
    writeDraft(draftKey, { text: "", pending: { clientId: message.clientId, text, visibility: message.visibility, files, at } });
    forget(message.attachmentIds);
    sends.begin({
      clientId: message.clientId,
      body: text.trim(),
      visibility: message.visibility,
      files,
      at,
      status: "sending",
      retry: () => retry(message.clientId),
      edit: () => edit(message.clientId),
      discard: () => discard(message.clientId),
    });
    showSent(message.clientId);
    void post(message);
  }

  /** Pinned over the page, the bar can send from anywhere on it: bring the new card into view above the bar. */
  function showSent(clientId: string) {
    if (inset <= 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clear = inset + 16;
    // The card is drawn on the next frame or two.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const card = document.getElementById(`update-pending-${clientId}`);
        if (!card) return;
        card.style.scrollMarginBottom = `${clear}px`;
        card.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
      }),
    );
  }

  /** An inline box above a fixed bar: scroll it to sit clear of the bar, now and again as the keyboard and the page settle. */
  function revealBox() {
    if (!clearance) return;
    for (const ms of [60, 400, 1000]) later(ms, () => box.current?.scrollIntoView({ block: "nearest", behavior: "auto" }));
  }

  function retry(clientId: string) {
    const entry = sent.current.get(clientId);
    if (!entry) return;
    sends?.update(clientId, { status: "sending", error: undefined });
    void post(entry.message);
  }

  function edit(clientId: string) {
    const entry = sent.current.get(clientId);
    if (!entry) return;
    sent.current.delete(clientId);
    sends?.remove(clientId);
    unforget(entry.files.map((f) => f.id));
    const current = readDraft(draftKey);
    writeDraft(draftKey, {
      text: current.text ? `${entry.message.body}\n\n${current.text}` : entry.message.body,
      visibility: entry.message.visibility,
      pending: current.pending?.clientId === clientId ? null : current.pending,
    });
    field.current?.focus();
  }

  function discard(clientId: string) {
    const entry = sent.current.get(clientId);
    sent.current.delete(clientId);
    sends?.remove(clientId);
    // The files were uploaded and never posted: they are drafts again, waiting in the tray.
    if (entry) unforget(entry.files.map((f) => f.id));
    if (readDraft(draftKey).pending?.clientId === clientId) writeDraft(draftKey, { pending: null });
  }

  function unready(r: ComposerDraft) {
    if (!uploader) return;
    const photo = fileKindForType(uploadContentType(r.filename, "")) === "image";
    // The tile goes at once and the file is deleted when the toast ends; Undo brings it back.
    undoable({
      message: photo ? "Photo removed" : "File removed",
      hide: () => forget([r.id]),
      show: () => unforget([r.id]),
      remove: async () => {
        const res = await callAction(() => uploader.remove(r));
        if (!res.ok) {
          unforget([r.id]);
          toast({ message: `Couldn't remove ${r.filename}.` });
        }
      },
    });
  }

  // Active: something is being written or held, or the field has focus. The audience line and the tools show on a phone only then.
  const active = text.length > 0 || ready.length > 0 || heldIds.length > 0 || (api?.uploads.length ?? 0) > 0 || internal;
  const open = active || focused;
  // The tools row holds the switch and the file button; without either it has nothing to show.
  const tools = mode === "switch" || !!api;

  // The keys that send from the text box sit inside the button, at its trailing edge, for a mouse: Kbd
  // hides on touch, and here below md and in a narrow column, so Send is just its word there. The button
  // carries the shortcut for assistive tech; the printed keys stay out of its name.
  const sendButton = (className: string) => (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={!canSend}
      // Pressing Send keeps focus in the field, so a phone's keyboard stays up for the next line.
      onMouseDown={(e) => e.preventDefault()}
      onClick={send}
      pending={sendingNow}
      aria-keyshortcuts="Meta+Enter Control+Enter"
      className={className}
    >
      {label}
      <Kbd aria-hidden="true" className="max-md:hidden @max-md/composer:hidden">
        {shortcutLabel(mod, "↵")}
      </Kbd>
    </Button>
  );

  // Focusing the field grows the bar (the audience line and the tools row). If you were at the end of Activity, the
  // page follows it so the last entry stays just above. An inline box above a fixed bar is brought clear of it.
  function onFieldFocus() {
    if (!pinned) return revealBox();
    if (window.matchMedia("(min-width: 48rem)").matches) return;
    const root = document.scrollingElement;
    const atEnd = !!root && root.scrollHeight - (root.scrollTop + window.innerHeight) < 160;
    if (!atEnd) return;
    stickToEnd.current = true;
    later(800, () => (stickToEnd.current = false));
    requestAnimationFrame(scrollToEnd);
  }

  return (
    <div
      ref={box}
      style={clearance ? { scrollMarginBottom: clearance } : undefined}
      data-active={active || undefined}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      className={cn(
        // A container, so the tools row can drop the keycap when the column is narrow (lg with the sidebar pinned).
        "group/composer @container/composer relative border transition-colors print:hidden",
        pinned
          ? cn(
              // Edge to edge over a top rule, above the keyboard and the home indicator, and out of the way while a comment is being edited.
              // `mt-auto` takes the spare height of a short page's flex column, so the bar sits on the bottom edge with nothing to scroll.
              // Its foot margin makes room for the keyboard under it, so the page can still scroll its last entry above the lifted bar.
              "max-md:sticky max-md:bottom-[var(--kb-inset,0px)] max-md:z-20 max-md:-mx-4 max-md:mb-[calc(var(--kb-inset,0px)_-_1rem)] max-md:mt-auto max-md:border-x-0 max-md:border-b-0",
              "max-md:pb-[max(0px,calc(env(safe-area-inset-bottom)-var(--kb-inset,0px)))] md:rounded-lg",
              "[html[data-editing-comment]_&]:max-md:hidden",
            )
          : "rounded-lg",
        // Both grounds are opaque: on a phone it sits over the page.
        internal ? "border-line bg-fill-1" : "border-line bg-surface",
        // Same drop cue as the Attachments box.
        dropState.over && "border-act",
      )}
    >
      {api?.inputs}
      {/* Only a pinned bar lifts the toasts; an inline box leaves them to the page's own bar (the portal's ActionBar). */}
      {pinned && <ToastLift px={inset} />}
      {audienceLine &&
        (internal ? (
          <p className={cn("items-center gap-1.5 px-4 pt-2 text-meta font-medium text-fg-2 md:px-3", open ? "flex" : "hidden md:flex")}>
            <Lock className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="flex min-w-0 flex-1">{audienceLine}</span>
          </p>
        ) : (
          <p className={cn("min-w-0 px-4 pt-2 text-meta text-fg-3 md:px-3", open ? "flex" : "hidden md:flex")}>{audienceLine}</p>
        ))}
      {uploader && ready.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-4 pt-2.5 md:px-3">
          {ready.map((r) => (
            <UploadTile key={r.id} upload={asReadyUpload(r, uploader.fileUrl(r.id))} grid={false} ready onFill={internal} onRemove={() => unready(r)} />
          ))}
        </ul>
      )}
      {api && <MediaUploadTray uploader={api} onFill={internal} className="px-4 pt-2.5 md:px-3" />}
      {held?.tray && <div className="px-4 pt-2.5 md:px-3">{held.tray}</div>}
      {/* On a phone the row sits on the 16px gutter, like the cards above it. */}
      <div className={cn("flex items-end gap-1 px-4 py-1.5 md:px-2", !api && "md:pl-2.5")}>
        {api && (
          <IconButton label="Take photo or video" onPress={api.takePhoto} onFill={internal} className="pointer-fine:hidden">
            <Camera />
          </IconButton>
        )}
        <textarea
          ref={field}
          aria-label={internal ? "Internal note" : placeholders.shared}
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onFocus={onFieldFocus}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            } else if (e.key === "Escape") {
              // Leaves the field and keeps the draft; it never clears the text. One Esc closes one layer.
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          onPaste={(e) => {
            if (api && e.clipboardData.files.length > 0) {
              e.preventDefault();
              api.addFiles(e.clipboardData.files);
            }
          }}
          // Five lines on a phone, so the bar stays under half of what an iPhone SE shows above its keyboard; the old cap from md.
          className="max-h-[6.875rem] min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-body text-fg-1 outline-none placeholder:text-fg-3 md:max-h-48 md:min-h-12 md:px-1"
        />
        {sendButton(cn("mb-0.5", tools && "md:hidden"))}
      </div>
      {/* Pressing a tool keeps focus in the text box, so on a phone the row
          (shown while it has focus) doesn't vanish mid-tap. Keyboard focus
          still reaches each control. */}
      {tools && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          className={cn("items-center gap-1 px-4 pb-1.5 md:flex md:px-2 md:pb-2", open ? "flex" : "hidden")}
        >
          {api && (
            <IconButton label="Add photos, videos or files" onPress={api.chooseFiles} onFill={internal}>
              <ImagePlus />
            </IconButton>
          )}
          {mode === "switch" && (
            <SegmentedControl
              aria-label="Who sees this"
              // On the internal note's --fill-1 ground the track steps up to --fill-2, or it vanishes.
              className={cn("ml-auto", internal && "bg-fill-2")}
              value={visibility}
              onChange={setVisibility}
              options={[
                { key: "SHARED", label: "Shared" },
                { key: "INTERNAL", label: "Internal" },
              ]}
            />
          )}
          {sendButton(cn("hidden md:inline-flex", mode !== "switch" && "ml-auto"))}
        </div>
      )}
      {/* With no zone around it, the composer is the target and draws its own label. */}
      {!zone && <DropLabel state={dropState} label={dropText} />}
    </div>
  );
}

/** Keeps the toasts above the pinned bar while it is mounted. */
function ToastLift({ px }: { px: number }) {
  useToastInset(px);
  return null;
}

/** A file recorded and waiting to go out, as the upload tile draws it (ready: no ring, its picture, "ready to send"). */
function asReadyUpload(r: ComposerDraft, url: string): MediaUpload {
  return {
    key: r.id,
    name: r.filename,
    kind: fileKindForType(uploadContentType(r.filename, "")),
    previewUrl: url,
    progress: 1,
    status: "saving",
  };
}

function IconButton({
  label,
  onPress,
  onFill = false,
  className,
  children,
}: {
  label: string;
  onPress: () => void;
  /** On the internal note's --fill-1 ground, where the ghost hover would vanish: it steps up to --fill-2. */
  onFill?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onPress}
      // A ghost icon button with its icon idle in --fg-3, --fg-1 on hover.
      className={cn(
        buttonClass({ variant: "ghost", icon: true }),
        "shrink-0 text-fg-3 [&_svg]:size-4.5",
        onFill && "not-disabled:hover:bg-fill-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Whether a failed send's error was for want of a connection (the line says so). */
export function isOfflineMessage(error: string | undefined): boolean {
  return error === OFFLINE_ERROR;
}
