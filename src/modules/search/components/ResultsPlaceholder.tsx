/**
 * Static stand-in for the first page of results while the first search
 * runs. Fixed heights, no shimmer or pulse — the results header's live
 * region says what is happening; this only keeps the layout steady.
 */
export function ResultsPlaceholder({ rows = 3 }: { rows?: number }) {
  return (
    <div
      aria-hidden
      data-slot="results-placeholder"
      className="flex flex-col gap-(--stack-gap)"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex h-[132px] flex-col gap-3 rounded-xl border border-border bg-card p-4"
        >
          <div className="h-4 w-2/3 rounded bg-secondary" />
          <div className="h-3 w-1/3 rounded bg-secondary" />
          <div className="flex gap-2">
            <div className="h-6 w-24 rounded-md bg-secondary" />
            <div className="h-6 w-20 rounded-md bg-secondary" />
          </div>
          <div className="mt-auto h-3 w-1/4 rounded bg-secondary" />
        </div>
      ))}
    </div>
  );
}
