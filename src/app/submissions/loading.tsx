import { Skeleton } from "@/components/ui/Skeleton";

export default function SubmissionsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="w-full" style={{ height: 360 }} />
    </div>
  );
}
