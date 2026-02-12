import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { useGeoblock } from "@/hooks/useGeoblock";

export function GeoblockBanner() {
  const { isBlocked, country, isLoading, hasChecked } = useGeoblock();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || !hasChecked || !isBlocked || dismissed) {
    return null;
  }

  return (
    <div className="bg-wild-warning/10 border-b border-wild-warning/30 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-wild-warning text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            Trading is restricted in {country || "your region"}. You can view markets but cannot place bets.
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-wild-warning/60 hover:text-wild-warning p-1"
          data-testid="button-dismiss-geoblock"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
