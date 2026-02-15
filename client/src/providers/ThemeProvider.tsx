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

/** Convert "#18181b" -> "240 6% 10%" for shadcn's HSL CSS variable format */
function hexToHsl(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '';
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(l * 100)}%`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
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

/** Render a Lucide icon SVG path onto a 32×32 canvas and return a data URL for use as favicon */
function renderIconToFavicon(iconName: string, color: string): string | null {
  const ICON_PATHS: Record<string, string> = {
    zap: 'M13 2L3 14h9l-1 10 10-12h-9l1-10z',
    flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14 0-5.5 2.5-7.5 0 0 1.5 3 1.5 5 0 1-0.5 2-1 3s-1 2.5 0 4c0.5 0.75 1.5 1 2.5 0.5s1.5-1.5 1-3c-.5-1.5-1-2.5-0.5-4S18 3 18 3c2.5 3 3.5 6 2 9.5S16 18 13.5 18 9 16.5 8.5 14.5z',
    target: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    trophy: 'M6 9H3.5a2.5 2.5 0 0 1 0-5H6m12 5h2.5a2.5 2.5 0 0 0 0-5H18M6 9V4h12v5m-6 4v4m-4 0h8m-4 0v3',
    crown: 'M2 4l3 12h14l3-12-6 7-4-9-4 9-6-7z',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    rocket: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3 7.5-7.5a2.12 2.12 0 0 1 3 3L12 15z',
    gem: 'M6 3h12l4 6-10 13L2 9z',
    heart: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
    sparkles: 'M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z',
    star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  };

  const pathData = ICON_PATHS[iconName];
  if (!pathData) return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${pathData}"/></svg>`;
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 32, 32);
      URL.revokeObjectURL(url);
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (link) link.href = canvas.toDataURL('image/png');
    };
    img.src = url;
  } catch {
    // Favicon rendering failed silently
  }
  return null;
}

function applyFavicon(theme: ThemeConfig) {
  const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
  if (!link) return;

  if (theme.brand?.logoUrl) {
    link.href = theme.brand.logoUrl;
  } else if (theme.brand?.logoIcon && theme.brand.logoIcon !== 'none') {
    renderIconToFavicon(theme.brand.logoIcon, theme.brand.primaryColor || '#f43f5e');
  }
}

function applyTheme(theme: ThemeConfig) {
  const root = document.documentElement;

  // Brand
  if (theme.brand?.name) {
    document.title = theme.brand.name;
  }

  // Dynamic favicon
  applyFavicon(theme);

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
  root.style.setProperty('--market-moneyline-away', theme.marketCards?.moneylineAwayAccent || '#3b82f6');
  root.style.setProperty('--market-moneyline-draw', theme.marketCards?.moneylineDrawAccent || '#71717a');
  root.style.setProperty('--market-totals', theme.marketCards?.totalsAccent || '#3b82f6');
  root.style.setProperty('--market-more', theme.marketCards?.moreMarketsAccent || '#8b5cf6');

  // Sync shadcn Card tokens (HSL format) so <Card> wrapper matches inner elements
  const cardHsl = hexToHsl(theme.marketCards?.backgroundColor || '#18181b');
  const cardFgHsl = hexToHsl(theme.marketCards?.textColor || '#fafafa');
  const cardBorderHsl = hexToHsl(theme.marketCards?.borderColor || '#3f3f46');
  if (cardHsl) root.style.setProperty('--card', cardHsl);
  if (cardFgHsl) root.style.setProperty('--card-foreground', cardFgHsl);
  if (cardBorderHsl) root.style.setProperty('--card-border', cardBorderHsl);

  // Sorting Bar
  root.style.setProperty('--sort-bg', theme.sortingBar?.backgroundColor || '#09090b');
  root.style.setProperty('--sort-active', theme.sortingBar?.activeTabColor || '#f43f5e');
  root.style.setProperty('--sort-inactive', theme.sortingBar?.inactiveTabColor || '#71717a');

  // Bottom Nav
  root.style.setProperty('--nav-bg', theme.bottomNav?.backgroundColor || '#09090b');
  root.style.setProperty('--nav-active', theme.bottomNav?.activeColor || '#fbbf24');
  root.style.setProperty('--nav-inactive', theme.bottomNav?.inactiveColor || '#71717a');

  // Dashboard
  const dashAccent = theme.dashboard?.accentColor || '#3b82f6';
  const dashAction = theme.dashboard?.actionColor || '#fbbf24';
  const dashPositive = theme.dashboard?.positiveColor || '#34d399';
  const dashNegative = theme.dashboard?.negativeColor || '#f43f5e';
  root.style.setProperty('--dash-accent', dashAccent);
  root.style.setProperty('--dash-action', dashAction);
  root.style.setProperty('--dash-positive', dashPositive);
  root.style.setProperty('--dash-negative', dashNegative);
  const daRgb = hexToRgb(dashAccent);
  const dActRgb = hexToRgb(dashAction);
  const dPosRgb = hexToRgb(dashPositive);
  const dNegRgb = hexToRgb(dashNegative);
  if (daRgb) root.style.setProperty('--dash-accent-rgb', daRgb);
  if (dActRgb) root.style.setProperty('--dash-action-rgb', dActRgb);
  if (dPosRgb) root.style.setProperty('--dash-positive-rgb', dPosRgb);
  if (dNegRgb) root.style.setProperty('--dash-negative-rgb', dNegRgb);
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
      moneylineAwayAccent: '#3b82f6',
      moneylineDrawAccent: '#71717a',
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
    dashboard: {
      accentColor: '#3b82f6',
      actionColor: '#fbbf24',
      positiveColor: '#34d399',
      negativeColor: '#f43f5e',
    },
  });
}
