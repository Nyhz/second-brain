export function EmptyState({ message }: { message: string }) {
  return <p className="sb-ui-state-empty">{message}</p>;
}

export function ErrorState({ message }: { message: string }) {
  return <p className="sb-ui-state-error">{message}</p>;
}

export function LoadingSkeleton({ lines = 4 }: { lines?: number }) {
  const ids = Array.from({ length: lines }, (_, idx) => `line-${idx}`);
  return (
    <div className="sb-ui-skeleton-wrap">
      {ids.map((id) => (
        <div key={id} className="sb-ui-skeleton-line" />
      ))}
    </div>
  );
}
