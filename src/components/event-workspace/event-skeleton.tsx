import { Skeleton } from "@/components/ui/skeleton";

/** R16: the shape of an event page while it loads, so it feels quicker than a blank screen. */
export function EventSkeleton() {
  return (
    <div role="status" aria-label="Loading event" className="min-h-full">
      <div className="border-b bg-card">
        <div className="mx-auto max-w-[90rem] px-4 lg:px-6 py-3 flex flex-wrap items-center gap-3">
          <div className="space-y-2 flex-1 min-w-[12rem]">
            <Skeleton className="h-6 w-64 max-w-full" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-9 w-full lg:w-[22rem]" />
          <Skeleton className="size-9" />
        </div>
      </div>
      <div className="mx-auto max-w-[90rem] px-4 lg:px-6 py-4 grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="hidden lg:block space-y-2">
          {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-8" style={{ width: `${70 + ((i * 13) % 30)}%` }} />)}
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5 grid gap-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
      <span className="sr-only">Loading event…</span>
    </div>
  );
}
