import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center min-h-[50vh] text-center opacity-60 p-4">
      <Icon className="w-12 h-12 text-[var(--text-muted)] mb-4" />
      <h3 className="font-bold text-[var(--text-muted)]">{title}</h3>
      <p className="text-xs text-[var(--text-muted)] mt-2">{description}</p>
    </div>
  );
}
