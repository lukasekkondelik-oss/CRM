import { Skeleton } from "@/components/ui/skeleton";

export function PageHeaderSkeleton() {
  return (
    <div className="mb-6">
      <Skeleton className="h-8 w-44" />
      <Skeleton className="mt-2 h-4 w-72 max-w-full" />
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Načítání pipeline">
      <PageHeaderSkeleton />
      <div className="mb-4 flex flex-wrap gap-2">{[40, 36, 28, 28].map((w, i) => <Skeleton key={i} className="h-9 rounded-lg" style={{ width: `${w * 4}px` }} />)}</div>
      <div className="-mx-4 flex gap-3 overflow-hidden px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        {[3, 2, 2, 1, 1].map((n, c) => (
          <div key={c} className="w-[84vw] max-w-80 shrink-0 rounded-xl bg-muted/50 p-2.5 sm:w-72">
            <Skeleton className="mb-1 h-4 w-28" />
            <Skeleton className="mb-3 h-3 w-20" />
            <div className="flex flex-col gap-2">{Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ cols = 6, rows = 8 }: { cols?: number; rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Načítání seznamu">
      <PageHeaderSkeleton />
      <Skeleton className="mb-4 h-10 w-full max-w-sm" />
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid gap-4 border-b bg-muted/40 px-3 py-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className="h-3 w-16" />)}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid gap-4 border-b px-3 py-3.5 last:border-0" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className="h-4" style={{ width: `${55 + ((r * 7 + i * 13) % 40)}%` }} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Načítání dashboardu">
      <PageHeaderSkeleton />
      <div className="mb-5 flex gap-2"><Skeleton className="h-9 w-48 rounded-lg" /><Skeleton className="h-9 w-48 rounded-lg" /></div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      <div className="mb-6 grid gap-4 xl:grid-cols-2"><Skeleton className="h-80 rounded-xl" /><Skeleton className="h-80 rounded-xl" /></div>
      <div className="grid gap-4 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Načítání detailu">
      <Skeleton className="mb-4 h-4 w-20" />
      <Skeleton className="mb-2 h-9 w-72 max-w-full" />
      <Skeleton className="mb-6 h-4 w-48" />
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Skeleton className="h-80 rounded-xl" />
        <div className="flex flex-col gap-4"><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-56 rounded-xl" /></div>
      </div>
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Načítání aktivit">
      <PageHeaderSkeleton />
      <div className="mb-4 flex gap-2"><Skeleton className="h-10 w-80 rounded-lg" /><Skeleton className="h-9 w-40 rounded-lg" /></div>
      <div className="flex flex-col gap-4">{Array.from({ length: 2 }).map((_, g) => (
        <div key={g}><Skeleton className="mb-2 h-3 w-40" /><div className="divide-y rounded-xl border bg-card">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="flex items-center gap-3 px-3 py-3"><Skeleton className="size-5 rounded-full" /><Skeleton className="h-4 flex-1" /><Skeleton className="size-6 rounded-full" /></div>)}</div></div>
      ))}</div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Načítání nastavení">
      <PageHeaderSkeleton />
      <div className="mb-6 flex gap-4 border-b pb-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-28" />)}</div>
      <div className="flex max-w-3xl flex-col gap-5"><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-56 rounded-xl" /></div>
    </div>
  );
}
