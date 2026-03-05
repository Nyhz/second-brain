export function EmptyState({ message }: { message: string }) {
  return <p className="px-4 py-2 text-sm text-muted-foreground">{message}</p>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <p className="px-4 py-2 text-sm font-medium text-destructive">{message}</p>
  );
}

export function LoadingSkeleton({ lines = 4 }: { lines?: number }) {
  const ids = Array.from({ length: lines }, (_, idx) => `line-${idx}`);
  return (
    <div className="grid gap-2 px-4 py-2">
      {ids.map((id) => (
        <div key={id} className="h-4 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}
