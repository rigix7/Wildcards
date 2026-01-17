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
    <nav className="shrink-0 bg-zinc-900 border-t border-zinc-800 z-30 bottom-nav-safe">
      <div className="grid grid-cols-4 h-16">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 transition-colors",
                isActive ? tab.color : "text-zinc-600"
              )}
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
