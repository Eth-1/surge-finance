import { Skeleton, CardSkeleton } from "@/components/ui/Skeleton";

export default function StatusLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-16 w-full" />
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}
