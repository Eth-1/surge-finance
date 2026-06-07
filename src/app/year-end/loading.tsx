import { Skeleton } from "@/components/ui/Skeleton";

export default function YearEndLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <Skeleton className="h-6 w-56" />
      <Skeleton className="h-12 w-full" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
