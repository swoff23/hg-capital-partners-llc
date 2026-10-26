/**
 * The `modal` slot of the app layout (forms 3, "New task, deal and property
 * become sheets that keep their URLs"). Intercepting routes in this folder
 * open a create sheet over the page on a click in the app, while a pasted
 * link or a reload opens the full page with the same form: `(.)tasks/new`,
 * `(.)deals/new`, `(.)properties/new` and `(.)contractors/new`. Next 16 needs
 * a default for every slot on a full page load (default.md), and with
 * nothing intercepted the slot shows nothing.
 */
export default function ModalDefault() {
  return null;
}
