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

/** Convert "#fb7185" -> "251 113 133" for Tailwind's rgb() alpha syntax */
function hexToRgb(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '';
  return `${r} ${g} ${b}`;
}

function applyTheme(theme: ThemeConfig) {
  const root = document.documentElement;

  // Brand
  if (theme.brand?.name) {
    document.title = theme.brand.name;
  }

  // General-purpose semantic variables (derived from theme sections)
  // These map the widespread bg-zinc-*/text-zinc-*/border-zinc-* patterns
  const pageBg = theme.sortingBar?.backgroundColor || '#09090b';       // zinc-950
  const cardBg = theme.marketCards?.backgroundColor || '#18181b';       // zinc-900
  const cardBgElevated = theme.marketCards?.hoverColor || '#27272a';    // zinc-800
  const cardBgHover = theme.marketCards?.borderColor || '#3f3f46';      // zinc-700
  const textPrimary = theme.marketCards?.textColor || '#fafafa';        // white
  const textMuted = theme.sortingBar?.inactiveTabColor || '#71717a';    // zinc-500
  const borderPrimary = theme.marketCards?.hoverColor || '#27272a';     // zinc-800
  const borderSecondary = theme.marketCards?.borderColor || '#3f3f46';  // zinc-700
  const primaryColor = theme.brand?.primaryColor || '#f43f5e';
  const accentColor = theme.brand?.accentColor || '#fbbf24';

  root.style.setProperty('--page-bg', pageBg);
  root.style.setProperty('--card-bg', cardBg);
  root.style.setProperty('--card-bg-elevated', cardBgElevated);
  root.style.setProperty('--card-bg-hover', cardBgHover);
  root.style.setProperty('--text-primary', textPrimary);
  root.style.setProperty('--text-secondary', '#a1a1aa');
  root.style.setProperty('--text-muted', textMuted);
  root.style.setProperty('--border-primary', borderPrimary);
  root.style.setProperty('--border-secondary', borderSecondary);
  root.style.setProperty('--primary-color', primaryColor);
  root.style.setProperty('--accent-color', accentColor);

  // Global
  root.style.setProperty('--success-color', theme.global?.successColor || '#10b981');
  root.style.setProperty('--error-color', theme.global?.errorColor || '#ef4444');
  root.style.setProperty('--warning-color', theme.global?.warningColor || '#f59e0b');

  // Wild color system — RGB triplets driving all wild-* Tailwind classes site-wide
  const brandRgb = hexToRgb(theme.brand?.primaryColor || '#fb7185');
  const scoutRgb = hexToRgb(theme.global?.successColor || '#34d399');
  const goldRgb = hexToRgb(theme.brand?.accentColor || '#fbbf24');
  const errorRgb = hexToRgb(theme.global?.errorColor || '#ef4444');
  const warningRgb = hexToRgb(theme.global?.warningColor || '#f59e0b');
  if (brandRgb) root.style.setProperty('--wild-brand-rgb', brandRgb);
  if (scoutRgb) root.style.setProperty('--wild-scout-rgb', scoutRgb);
  if (goldRgb) root.style.setProperty('--wild-gold-rgb', goldRgb);
  if (errorRgb) root.style.setProperty('--wild-error-rgb', errorRgb);
  if (warningRgb) root.style.setProperty('--wild-warning-rgb', warningRgb);

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
