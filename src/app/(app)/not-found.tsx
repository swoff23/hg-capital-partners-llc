import { Card, CardBody, CardHeader, CardTitle, TextLink } from "@/components/ui";

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
            <TextLink href="/">Home</TextLink>
            <TextLink href="/deals">Deals</TextLink>
            <TextLink href="/properties">Portfolio</TextLink>
            <TextLink href="/tasks">Tasks</TextLink>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
