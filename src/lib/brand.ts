/**
 * The brand's words, in one place, so a re-brand is one edit here plus the
 * color tokens in src/app/globals.css (docs/brand-guidelines.md, section 6).
 * New uses read from here; older literals move over as their screens are
 * restyled.
 */
export const BRAND = {
  /** The monogram's letters. */
  mark: "HG",
  /** The app's wordmark beside the tile. */
  app: "HG Capital",
  /** The contractor portal's wordmark (Connor, Nov 14: the company's name, not "HG Jobs"). */
  portal: "HG Capital Partners",
  /** The company: public site, emails and PDFs. */
  company: "HG Capital Partners",
} as const;
