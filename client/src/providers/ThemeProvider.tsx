import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import type { ThemeConfig } from "@shared/schema";

interface WhiteLabelConfig {
  themeConfig?: ThemeConfig | null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: config } = useQuery<WhiteLabelConfig>({
    queryKey: ["/api/config/theme"],
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (config?.themeConfig) {
      applyTheme(config.themeConfig);
    } else {
      applyDefaultTheme();
    }
  }, [config]);

  return <>{children}</>;
}

function applyTheme(theme: ThemeConfig) {
  const root = document.documentElement;

  // Brand
  if (theme.brand?.name) {
    document.title = theme.brand.name;
  }

  // Header
  root.style.setProperty('--header-bg', theme.header?.backgroundColor || '#09090b');
  root.style.setProperty('--header-text', theme.header?.textColor || '#fafafa');
  root.style.setProperty('--header-accent', theme.header?.accentColor || '#fbbf24');

  // BetSlip
  root.style.setProperty('--betslip-bg', theme.betSlip?.backgroundColor || '#18181b');
  root.style.setProperty('--betslip-card', theme.betSlip?.cardColor || '#27272a');
  root.style.setProperty('--betslip-primary', theme.betSlip?.primaryButtonColor || '#f43f5e');
  root.style.setProperty('--betslip-success', theme.betSlip?.successColor || '#10b981');
  root.style.setProperty('--betslip-text', theme.betSlip?.textColor || '#fafafa');

  // Also set the legacy --wl-betslip-* variables for backward compat with BetSlip
  root.style.setProperty('--wl-betslip-bg', theme.betSlip?.backgroundColor || '#18181b');
  root.style.setProperty('--wl-betslip-text', theme.betSlip?.textColor || '#fafafa');

  // Market Cards
  root.style.setProperty('--market-bg', theme.marketCards?.backgroundColor || '#18181b');
  root.style.setProperty('--market-hover', theme.marketCards?.hoverColor || '#27272a');
  root.style.setProperty('--market-border', theme.marketCards?.borderColor || '#3f3f46');
  root.style.setProperty('--market-odds-badge', theme.marketCards?.oddsBadgeColor || '#fbbf24');
  root.style.setProperty('--market-text', theme.marketCards?.textColor || '#fafafa');
  root.style.setProperty('--market-moneyline', theme.marketCards?.moneylineAccent || '#f43f5e');
  root.style.setProperty('--market-totals', theme.marketCards?.totalsAccent || '#3b82f6');
  root.style.setProperty('--market-more', theme.marketCards?.moreMarketsAccent || '#8b5cf6');

  // Sorting Bar
  root.style.setProperty('--sort-bg', theme.sortingBar?.backgroundColor || '#09090b');
  root.style.setProperty('--sort-active', theme.sortingBar?.activeTabColor || '#f43f5e');
  root.style.setProperty('--sort-inactive', theme.sortingBar?.inactiveTabColor || '#71717a');

  // Bottom Nav
  root.style.setProperty('--nav-bg', theme.bottomNav?.backgroundColor || '#09090b');
  root.style.setProperty('--nav-active', theme.bottomNav?.activeColor || '#fbbf24');
  root.style.setProperty('--nav-inactive', theme.bottomNav?.inactiveColor || '#71717a');
}

function applyDefaultTheme() {
  applyTheme({
    brand: { name: "WILDCARDS", primaryColor: "#f43f5e", accentColor: "#fbbf24" },
    header: {
      backgroundColor: '#09090b',
      textColor: '#fafafa',
      accentColor: '#fbbf24',
    },
    betSlip: {
      backgroundColor: '#18181b',
      cardColor: '#27272a',
      primaryButtonColor: '#f43f5e',
      successColor: '#10b981',
      textColor: '#fafafa',
    },
    marketCards: {
      backgroundColor: '#18181b',
      hoverColor: '#27272a',
      borderColor: '#3f3f46',
      oddsBadgeColor: '#fbbf24',
      textColor: '#fafafa',
      moneylineAccent: '#f43f5e',
      totalsAccent: '#3b82f6',
      moreMarketsAccent: '#8b5cf6',
    },
    sortingBar: {
      backgroundColor: '#09090b',
      activeTabColor: '#f43f5e',
      inactiveTabColor: '#71717a',
    },
    bottomNav: {
      backgroundColor: '#09090b',
      activeColor: '#fbbf24',
      inactiveColor: '#71717a',
    },
    global: {
      successColor: '#10b981',
      errorColor: '#ef4444',
      warningColor: '#f59e0b',
    },
  });
}
