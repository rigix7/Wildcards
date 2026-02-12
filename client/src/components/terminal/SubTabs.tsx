import { cn } from "@/lib/utils";

interface SubTabsProps<T extends string> {
  tabs: { id: T; label: string }[];
  activeTab: T;
  onTabChange: (tab: T) => void;
}

export function SubTabs<T extends string>({ tabs, activeTab, onTabChange }: SubTabsProps<T>) {
  return (
    <div className="shrink-0 border-b border-[var(--border-primary)] p-2 z-20" style={{ backgroundColor: 'var(--sort-bg, var(--page-bg))' }}>
      <div className="grid gap-1 bg-[var(--card-bg)] p-1 rounded-lg font-mono text-[10px] font-bold" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "py-1.5 rounded transition-all",
                isActive
                  ? "text-[var(--text-primary)] shadow"
                  : "hover:text-[var(--text-secondary)]"
              )}
              style={isActive
                ? { backgroundColor: 'var(--sort-active, var(--card-bg-elevated))' }
                : { color: 'var(--sort-inactive, var(--text-muted))' }
              }
              data-testid={`tab-${tab.id}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
