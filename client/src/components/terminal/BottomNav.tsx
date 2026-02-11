import { TrendingUp, Users, LineChart, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabType = "predict" | "scout" | "trade" | "dash";

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs: { id: TabType; label: string; icon: typeof TrendingUp; color: string }[] = [
  { id: "predict", label: "PREDICT", icon: TrendingUp, color: "text-wild-brand" },
  { id: "scout", label: "SCOUT", icon: Users, color: "text-wild-scout" },
  { id: "trade", label: "TRADE", icon: LineChart, color: "text-wild-trade" },
  { id: "dash", label: "DASH", icon: LayoutDashboard, color: "text-wild-gold" },
];

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav
      className="shrink-0 border-t border-zinc-800 z-30 bottom-nav-safe"
      style={{ backgroundColor: 'var(--nav-bg, #09090b)' }}
    >
      <div className="grid grid-cols-4 h-16">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex flex-col items-center justify-center gap-1 transition-colors"
              style={{ color: isActive ? 'var(--nav-active, #fbbf24)' : 'var(--nav-inactive, #71717a)' }}
              data-testid={`nav-${tab.id}`}
            >
              <Icon className="w-5 h-5" />
              <span
                className={cn(
                  "text-[10px] font-mono uppercase tracking-wide",
                  isActive && "font-bold"
                )}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
