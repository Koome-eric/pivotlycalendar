import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { SourceDetailView } from "./source-detail-view";

export default async function SourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const source = await prisma.calendarSource.findUnique({
    where: { id },
    include: {
      location: true,
      importJobs: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          syncLogs: { where: { status: "error" }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  if (!source) redirect("/");

  const [events, totalEvents] = await Promise.all([
    prisma.importedEvent.findMany({
      where: { calendarSourceId: id },
      orderBy: { startTime: "asc" },
      take: 25,
    }),
    prisma.importedEvent.count({ where: { calendarSourceId: id } }),
  ]);

  return (
    <SourceDetailView
      initialSource={JSON.parse(JSON.stringify(source))}
      initialEvents={JSON.parse(JSON.stringify(events))}
      initialPagination={{ page: 1, pageSize: 25, total: totalEvents, totalPages: Math.ceil(totalEvents / 25) || 1 }}
      locationId={source.location.locationId}
    />
  );
}