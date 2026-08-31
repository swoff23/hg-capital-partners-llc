/** Bottom of every public page. Same understated treatment as the header. */
export function PublicFooter() {
  return (
    <footer className="flex flex-col items-center gap-3 px-6 py-8 text-center text-[0.6875rem] tracking-wide text-[#454b55] sm:flex-row sm:justify-between sm:px-10">
      <span>&copy; {new Date().getFullYear()} HG Capital Partners LLC</span>
      <a
        href="mailto:hgcapitalpartnersllc@gmail.com"
        className="transition-colors hover:text-[#c8a765]"
      >
        Contact us
      </a>
    </footer>
  );
}
