import { redirect } from "next/navigation";
import { ImportWizard } from "./wizard";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string }>;
}) {
  const { locationId } = await searchParams;
  if (!locationId) redirect("/");

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <ImportWizard locationId={locationId} />
    </main>
  );
}
