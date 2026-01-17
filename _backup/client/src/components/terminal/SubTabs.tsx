import { cn } from "@/lib/utils";

interface SubTabsProps<T extends string> {
  tabs: { id: T; label: string }[];
  activeTab: T;
  onTabChange: (tab: T) => void;
}

export function SubTabs<T extends string>({ tabs, activeTab, onTabChange }: SubTabsProps<T>) {
  return (
    <div className="shrink-0 bg-zinc-950 border-b border-zinc-800 p-2 z-20">
      <div className="grid gap-1 bg-zinc-900 p-1 rounded-lg font-mono text-[10px] font-bold" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "py-1.5 rounded transition-all",
                isActive
                  ? "bg-zinc-800 text-white shadow"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
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
