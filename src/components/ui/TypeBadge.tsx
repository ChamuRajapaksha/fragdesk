export default function TypeBadge({ type }: { type: string }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-frag-primary/10 text-frag-primary">
      {type}
    </span>
  );
}