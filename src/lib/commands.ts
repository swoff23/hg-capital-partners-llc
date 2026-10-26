import { foldAccents } from "@/lib/search";

/**
 * What the command palette offers beside records (docs/specs/search.md 2.5):
 * Create, then Go to. Plain data with no React in it, so commands.test.ts can
 * check every href is a page. The palette draws each row's icon from `icon`.
 */

export type CommandIcon =
  | "home"
  | "deals"
  | "portfolio"
  | "financials"
  | "tasks"
  | "contractors"
  | "playbooks"
  | "settings"
  | "create";

export type Command = {
  /** Unique, and the row's key. */
  id: string;
  kind: "create" | "go";
  /** The row's title: "Rent roll", "New task". */
  label: string;
  /** The page it opens. Always a page under src/app/(app). */
  href: string;
  icon: CommandIcon;
  /** The section a tab belongs to ("Financials"), shown beside the label. */
  parent?: string;
  /** The record a Create row applies to ("767 Prospect Ave"), shown beside the label. */
  place?: string;
};

/** Every page the palette jumps to, in the order of the sidebar and its tabs. */
export const GO_TO: readonly Command[] = [
  { id: "go-home", kind: "go", label: "Home", href: "/", icon: "home" },
  { id: "go-deals", kind: "go", label: "Deals", href: "/deals", icon: "deals" },
  { id: "go-portfolio", kind: "go", label: "Portfolio", href: "/properties", icon: "portfolio" },
  { id: "go-financials", kind: "go", label: "Financials", href: "/financials", icon: "financials" },
  { id: "go-rent-roll", kind: "go", label: "Rent roll", href: "/financials/rent-roll", icon: "financials", parent: "Financials" },
  { id: "go-fin-settings", kind: "go", label: "Settings", href: "/financials/settings", icon: "financials", parent: "Financials" },
  { id: "go-tasks", kind: "go", label: "Tasks", href: "/tasks", icon: "tasks" },
  { id: "go-contractors", kind: "go", label: "Contractors", href: "/contractors", icon: "contractors" },
  { id: "go-playbooks", kind: "go", label: "Playbooks", href: "/templates", icon: "playbooks" },
  { id: "go-settings", kind: "go", label: "Settings", href: "/settings", icon: "settings" },
  { id: "go-move-in", kind: "go", label: "Move-in form", href: "/settings/move-in-form", icon: "settings", parent: "Settings" },
  { id: "go-storage", kind: "go", label: "Storage", href: "/settings/storage", icon: "settings", parent: "Settings" },
];

/** The record page the person is on, which Create rows apply to. */
export type PageContext = { kind: "property" | "deal"; id: string } | null;

/**
 * The record page a path is, read from the path and not from Recent, so a
 * visit to /tasks never labels a row with the last record opened. /properties/new
 * and /deals/new are the create forms, not records.
 */
export function pageContext(pathname: string): PageContext {
  const m = /^\/(properties|deals)\/([^/]+)\/?$/.exec(pathname);
  if (!m || m[2] === "new") return null;
  return { kind: m[1] === "properties" ? "property" : "deal", id: decodeURIComponent(m[2]) };
}

/** The Create rows. On a record page the ones that apply to it lead, with its address beside them. */
export function createCommands(context: PageContext, place?: string): Command[] {
  const newTask: Command = { id: "create-task", kind: "create", label: "New task", href: "/tasks/new", icon: "create" };
  const newDeal: Command = { id: "create-deal", kind: "create", label: "New deal", href: "/deals/new", icon: "create" };
  const newProperty: Command = { id: "create-property", kind: "create", label: "New property", href: "/properties/new", icon: "create" };
  if (context?.kind === "property") {
    const id = encodeURIComponent(context.id);
    const here = place ?? "This property";
    return [
      { ...newTask, href: `/tasks/new?propertyId=${id}`, place: here },
      { id: "create-playbook", kind: "create", label: "Apply playbook", href: `/templates?property=${id}`, icon: "create", place: here },
      newDeal,
      newProperty,
    ];
  }
  if (context?.kind === "deal") {
    const id = encodeURIComponent(context.id);
    return [{ ...newTask, href: `/tasks/new?dealId=${id}`, place: place ?? "This deal" }, newDeal, newProperty];
  }
  return [newTask, newDeal, newProperty];
}

const norm = (s: string) => foldAccents(s).toLowerCase();

/** The words a command is found by: its label and the section it belongs to. */
function words(c: Command): string[] {
  return norm([c.label, c.parent ?? ""].join(" ")).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * The commands a short query keeps (one character): any whose label or
 * section has a word that starts with it. No query keeps them all.
 */
export function commandsByWordStart(commands: readonly Command[], query: string): Command[] {
  const typed = norm(query).trim();
  if (!typed) return [...commands];
  return commands.filter((c) => {
    const w = words(c);
    const parts = typed.split(/\s+/);
    return parts.every((p) => w.some((word) => word.startsWith(p)));
  });
}

/** How many commands lead a typed search. */
export const LEADING_COMMANDS = 3;

/** Create before Go to; within each, a page before the tabs under it. */
const leadRank = (c: Command): number => (c.kind === "create" ? 0 : 2) + (c.parent === undefined ? 0 : 1);

/**
 * The commands that lead a search of two characters or more: those whose
 * label starts with what was typed ("rent" puts Rent roll first). Create
 * before Go to, a section's own page before its tabs ("settings" opens
 * Settings, not Financials > Settings), at most LEADING_COMMANDS.
 */
export function leadingCommands(commands: readonly Command[], query: string): Command[] {
  const typed = norm(query).trim().replace(/\s+/g, " ");
  if (typed.length < 2) return [];
  return commands
    .filter((c) => norm(c.label).startsWith(typed))
    .sort((a, b) => leadRank(a) - leadRank(b))
    .slice(0, LEADING_COMMANDS);
}

/** The path and query of an href, for checking it names a page. */
export function hrefPath(href: string): string {
  return href.split(/[?#]/)[0];
}
