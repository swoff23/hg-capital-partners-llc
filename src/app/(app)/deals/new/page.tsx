import { NewDealScreen } from "./new-deal-screen";

/** New deal as a page: a pasted link or a reload. A click inside the app opens it as a sheet over the list (`@modal/(.)deals/new`). */
export default function NewDealPage({ searchParams }: PageProps<"/deals/new">) {
  return <NewDealScreen variant="page" searchParams={searchParams} />;
}
