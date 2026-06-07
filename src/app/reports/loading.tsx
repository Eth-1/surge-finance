import { Skeleton, CardSkeleton } from "@/components/ui/Skeleton";

export default function ReportsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-16 w-full" />
      <CardSkeleton />
    </div>
  );
}
