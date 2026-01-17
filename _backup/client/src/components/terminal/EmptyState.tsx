import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center min-h-[50vh] text-center opacity-60 p-4">
      <Icon className="w-12 h-12 text-zinc-700 mb-4" />
      <h3 className="font-bold text-zinc-500">{title}</h3>
      <p className="text-xs text-zinc-600 mt-2">{description}</p>
    </div>
  );
}
