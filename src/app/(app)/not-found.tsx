import Link from "next/link";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";

/** Rendered when a signed-in page calls notFound() — a deal / property / task id that no longer exists. */
export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-lg py-10">
      <Card>
        <CardHeader>
          <CardTitle>Not found</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-sm">
          <p className="text-muted">That record doesn&apos;t exist, or the link is out of date.</p>
          <div className="flex flex-wrap gap-3 text-xs">
            <Link href="/" className="text-primary hover:underline">Home</Link>
            <Link href="/deals" className="text-primary hover:underline">Deals</Link>
            <Link href="/properties" className="text-primary hover:underline">Portfolio</Link>
            <Link href="/tasks" className="text-primary hover:underline">Tasks</Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
