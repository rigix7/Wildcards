import { Zap, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";

interface HeaderProps {
  usdcBalance: number;
  wildBalance: number;
  onWalletClick: () => void;
  isConnected?: boolean;
}

export function Header({ usdcBalance, wildBalance, onWalletClick, isConnected = false }: HeaderProps) {
  const { brandName, pointsName, pointsEnabled, logoUrl, logoIcon } = useTheme();
  const formatBalance = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <header
      className="h-14 shrink-0 flex items-center justify-between px-4 backdrop-blur-lg border-b border-[var(--border-primary)]/50 z-30"
      style={{ backgroundColor: 'var(--header-bg, #09090b)' }}
    >
      <div className="flex items-center gap-2" style={{ color: 'var(--header-accent, #fb7185)' }}>
        {logoUrl ? (
          <img src={logoUrl} alt={brandName} className="h-6 w-auto" />
        ) : logoIcon ? (
          <span className="text-xl">{logoIcon}</span>
        ) : (
          <Zap className="w-5 h-5 fill-current" />
        )}
        <span className="font-black italic tracking-tighter text-lg" style={{ color: 'var(--header-text, #ffffff)' }}>{brandName}</span>
      </div>
      {isConnected ? (
        <Button
          variant="ghost"
          onClick={onWalletClick}
          className="group flex items-center gap-3 bg-[var(--card-bg)]/50 border border-[var(--border-primary)] px-3 py-1.5 rounded-full"
          data-testid="button-wallet"
        >
          <div className="text-[10px] font-mono text-right leading-tight text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
            <div data-testid="text-usdc-balance">${formatBalance(usdcBalance)}</div>
            {pointsEnabled && (
              <div className="text-wild-scout" data-testid="text-wild-balance">
                {formatBalance(wildBalance)} {pointsName}
              </div>
            )}
          </div>
          <div className="w-6 h-6 rounded-full bg-[var(--card-bg-elevated)] flex items-center justify-center">
            <Wallet className="w-3 h-3 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]" />
          </div>
        </Button>
      ) : (
        <Button
          variant="ghost"
          onClick={onWalletClick}
          className="group flex items-center gap-2 bg-wild-brand/10 border border-wild-brand/30 px-3 py-1.5 rounded-full text-wild-brand"
          data-testid="button-connect"
        >
          <span className="text-xs font-bold">Connect</span>
          <Wallet className="w-4 h-4" />
        </Button>
      )}
    </header>
  );
}
