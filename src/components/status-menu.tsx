"use client";
import { ChevronDown } from "lucide-react";
import { Button as AriaButton, type Key } from "react-aria-components";
import type { TaskStatus } from "@prisma/client";
import { DealStage, DealStageMark } from "@/components/deal-stage";
import { Menu, MenuItem, MenuTrigger, type MenuFollowUp } from "@/components/menu";
import { StatusBadge, StatusMark } from "@/components/status-badge";
import { buttonClass } from "@/components/ui";
import { DEAL_STATUSES, dealStageLabel } from "@/lib/config";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/task-scope";
import { cn } from "@/lib/utils";

/**
 * Set a record's status or a deal's stage from its fixed list
 * (docs/specs/selectors.md 3.5): a `Menu` configured for the job. The trigger
 * is the ring and its word in the ring's tone, then a chevron; the rows are
 * the ring and the word with a trailing Check on the current one, and number
 * keys (1 to 7 for a task, 1 to 8 for a stage) print beside them with a
 * mouse. On a touch phone the list is a titled sheet. A pick that needs one
 * more answer (Waiting asks its reason, Scheduled its visit date) asks it in
 * the same layer through `followUp`, and the status commits only when it is
 * answered.
 *
 *   <StatusMenu kind="task" value={status} onChange={(to) => …} hidden={["REVIEW"]}
 *     followUp={(to) => (to === "WAITING" ? { title: "What's it waiting on?", content: … } : null)} />
 *
 * `hidden` values are left out of the list but keep their number, so Done is
 * 6 whether or not Review shows. Picking the current value closes without a
 * write. The caller toasts the change with Undo.
 */

type Common = {
  isDisabled?: boolean;
  /** "always" shows the chevron; "hover" only with a mouse over the control or over a `group/row` row it sits in (a table cell). */
  chevron?: "always" | "hover";
  className?: string;
};

export type StatusMenuProps =
  | (Common & {
      kind: "task";
      value: TaskStatus;
      onChange: (to: TaskStatus) => void;
      hidden?: readonly TaskStatus[];
      followUp?: (to: TaskStatus) => MenuFollowUp | null;
    })
  | (Common & {
      kind: "stage";
      /** The deal's stored status, "1 - High". */
      value: string;
      onChange: (to: string) => void;
      hidden?: readonly string[];
      followUp?: (to: string) => MenuFollowUp | null;
    });

/** The task statuses in menu order, and the deal stages in pipeline order: the order the number keys follow. */
const TASK_KEYS: readonly string[] = STATUS_ORDER;
const STAGE_KEYS: readonly string[] = DEAL_STATUSES;

export function StatusMenu(props: StatusMenuProps) {
  const { kind, value, isDisabled, chevron = "always", className } = props;
  const task = kind === "task";
  const keys = task ? TASK_KEYS : STAGE_KEYS;
  const hidden = new Set<string>(props.hidden ?? []);
  const noun = task ? "Status" : "Stage";
  const wordOf = (k: string) => (task ? STATUS_LABEL[k as TaskStatus] : dealStageLabel(k));

  // A stage the list doesn't have (the legacy "Active") still shows on the trigger and in the list, as stored.
  const listed = keys.includes(value) ? keys : [value, ...keys];

  function act(key: Key) {
    const to = String(key);
    if (to === value) return;
    if (props.kind === "task") props.onChange(to as TaskStatus);
    else props.onChange(to);
  }

  function followUp(key: Key): MenuFollowUp | null {
    const to = String(key);
    if (to === value) return null;
    return (props.kind === "task" ? props.followUp?.(to as TaskStatus) : props.followUp?.(to)) ?? null;
  }

  return (
    <MenuTrigger>
      <AriaButton
        isDisabled={isDisabled}
        aria-label={`${noun}: ${wordOf(value)}. Change ${noun.toLowerCase()}`}
        className={cn(buttonClass({ variant: "ghost", size: "sm" }), "group/status min-w-0 text-meta data-pressed:bg-fill-1", className)}
      >
        {task ? <StatusBadge status={value as TaskStatus} /> : <DealStage stage={value} label={dealStageLabel(value)} className="text-meta" />}
        <ChevronDown
          aria-hidden="true"
          className={cn("size-3.5 shrink-0 text-fg-3", chevron === "hover" && "opacity-0 group-hover/row:opacity-100 group-hover/status:opacity-100 group-data-pressed/status:opacity-100 pointer-coarse:opacity-100")}
        />
      </AriaButton>
      <Menu
        placement="bottom start"
        selectionMode="single"
        selectedKeys={[value]}
        numberKeys={keys}
        sheetTitle={noun}
        onAction={act}
        followUp={props.followUp ? followUp : undefined}
        aria-label={`Set ${noun.toLowerCase()}`}
      >
        {listed
          .filter((k) => !hidden.has(k) || k === value)
          .map((k) => (
            <MenuItem
              key={k}
              id={k}
              textValue={wordOf(k)}
              icon={task ? <StatusMark status={k as TaskStatus} /> : <DealStageMark stage={k} />}
            >
              {wordOf(k)}
            </MenuItem>
          ))}
      </Menu>
    </MenuTrigger>
  );
}
