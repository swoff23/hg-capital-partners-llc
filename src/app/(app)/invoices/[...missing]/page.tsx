import { notFound } from "next/navigation";

/**
 * Any address under /invoices that no page answers: the app's own Not found,
 * inside the shell ((app)/not-found.tsx), instead of the public site's 404.
 */
export default function Missing(): never {
  notFound();
}
