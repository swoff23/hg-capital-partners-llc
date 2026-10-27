import { notFound } from "next/navigation";

/**
 * Any address under /financials that no page answers: the app's own Not found,
 * inside the shell ((app)/not-found.tsx), instead of the public site's 404,
 * which would read as if a signed-in person had been signed out.
 */
export default function Missing(): never {
  notFound();
}
