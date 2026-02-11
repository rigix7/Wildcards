# Integration Test Matrix

> **Audit Date:** 2026-02-11
> **Purpose:** Systematic verification that every admin setting affects the user-facing app
> **Legend:** CONNECTED = working end-to-end | DISCONNECTED = admin change has no effect

---

## 1. Theme System Settings (26 total)

### 1.1 Brand Settings

| # | Setting | Admin Location | API Field | Mechanism | Component(s) | Status |
|---|---------|---------------|-----------|-----------|---------------|--------|
| 1 | Brand Name | WL → Brand → Name | `themeConfig.brand.name` | useTheme hook + document.title | Header, NotFound, WalletDrawer, Dashboard, PlayerCard | CONNECTED |
| 2 | Logo URL | WL → Brand → Logo URL | `themeConfig.brand.logoUrl` | useTheme hook | **None** (no `<img>` in Header) | DISCONNECTED |
| 3 | Logo Icon | WL → Brand → Logo Icon | `themeConfig.brand.logoIcon` | useTheme hook | **None** (no icon rendering) | DISCONNECTED |
| 4 | Primary Color | WL → Brand → Primary | `themeConfig.brand.primaryColor` | `--primary-color` CSS var | **None** (no component reads it) | DISCONNECTED |
| 5 | Accent Color | WL → Brand → Accent | `themeConfig.brand.accentColor` | `--accent-color` CSS var | **None** (no component reads it) | DISCONNECTED |

### 1.2 Header Settings

| # | Setting | Admin Location | API Field | CSS Variable | Component(s) | Status |
|---|---------|---------------|-----------|-------------|---------------|--------|
| 6 | Background Color | WL → Header → BG | `themeConfig.header.backgroundColor` | `--header-bg` | Header.tsx, home.tsx | CONNECTED |
| 7 | Text Color | WL → Header → Text | `themeConfig.header.textColor` | `--header-text` | Header.tsx | CONNECTED |
| 8 | Accent Color | WL → Header → Accent | `themeConfig.header.accentColor` | `--header-accent` | Header.tsx | CONNECTED |

### 1.3 BetSlip Settings

| # | Setting | Admin Location | API Field | CSS Variable | Component(s) | Status |
|---|---------|---------------|-----------|-------------|---------------|--------|
| 9 | Background Color | WL → BetSlip → BG | `themeConfig.betSlip.backgroundColor` | `--wl-betslip-bg` | BetSlip.tsx | CONNECTED |
| 10 | Card Color | WL → BetSlip → Card | `themeConfig.betSlip.cardColor` | `--betslip-card` | **None** (BetSlip uses `--wl-betslip-bg`) | DISCONNECTED |
| 11 | Primary Button | WL → BetSlip → Primary | `themeConfig.betSlip.primaryButtonColor` | `--betslip-primary` | BetSlip.tsx | CONNECTED |
| 12 | Success Color | WL → BetSlip → Success | `themeConfig.betSlip.successColor` | `--betslip-success` | **None** (hardcoded emerald) | DISCONNECTED |
| 13 | Text Color | WL → BetSlip → Text | `themeConfig.betSlip.textColor` | `--wl-betslip-text` | BetSlip.tsx | CONNECTED |

### 1.4 Market Card Settings

| # | Setting | Admin Location | API Field | CSS Variable | Component(s) | Status |
|---|---------|---------------|-----------|-------------|---------------|--------|
| 14 | Background Color | WL → Markets → BG | `themeConfig.marketCards.backgroundColor` | `--market-bg` | MarketCard.tsx | CONNECTED |
| 15 | Hover Color | WL → Markets → Hover | `themeConfig.marketCards.hoverColor` | `--market-hover` | **None** (no hover style uses it) | DISCONNECTED |
| 16 | Border Color | WL → Markets → Border | `themeConfig.marketCards.borderColor` | `--market-border` | MarketCard.tsx | CONNECTED |
| 17 | Odds Badge Color | WL → Markets → Badge | `themeConfig.marketCards.oddsBadgeColor` | `--market-odds-badge` | **None** | DISCONNECTED |
| 18 | Text Color | WL → Markets → Text | `themeConfig.marketCards.textColor` | `--market-text` | MarketCard.tsx | CONNECTED |
| 19 | Moneyline Accent | WL → Markets → ML | `themeConfig.marketCards.moneylineAccent` | `--market-moneyline` | MarketCard.tsx | CONNECTED |
| 20 | Totals Accent | WL → Markets → Totals | `themeConfig.marketCards.totalsAccent` | `--market-totals` | **None** | DISCONNECTED |
| 21 | More Markets Accent | WL → Markets → More | `themeConfig.marketCards.moreMarketsAccent` | `--market-more` | **None** | DISCONNECTED |

### 1.5 Sorting Bar Settings

| # | Setting | Admin Location | API Field | CSS Variable | Component(s) | Status |
|---|---------|---------------|-----------|-------------|---------------|--------|
| 22 | Background Color | WL → Sort → BG | `themeConfig.sortingBar.backgroundColor` | `--sort-bg` | **None** (SubTabs uses `--page-bg`) | DISCONNECTED |
| 23 | Active Tab Color | WL → Sort → Active | `themeConfig.sortingBar.activeTabColor` | `--sort-active` | **None** (SubTabs uses `--card-bg-elevated`) | DISCONNECTED |
| 24 | Inactive Tab Color | WL → Sort → Inactive | `themeConfig.sortingBar.inactiveTabColor` | `--sort-inactive` | **None** (SubTabs uses `--text-muted`) | DISCONNECTED |

### 1.6 Bottom Nav Settings

| # | Setting | Admin Location | API Field | CSS Variable | Component(s) | Status |
|---|---------|---------------|-----------|-------------|---------------|--------|
| 25 | Background Color | WL → Nav → BG | `themeConfig.bottomNav.backgroundColor` | `--nav-bg` | BottomNav.tsx | CONNECTED |
| 26 | Active Color | WL → Nav → Active | `themeConfig.bottomNav.activeColor` | `--nav-active` | BottomNav.tsx | CONNECTED |
| 27 | Inactive Color | WL → Nav → Inactive | `themeConfig.bottomNav.inactiveColor` | `--nav-inactive` | BottomNav.tsx | CONNECTED |

### 1.7 Global Settings

| # | Setting | Admin Location | API Field | CSS Variable | Component(s) | Status |
|---|---------|---------------|-----------|-------------|---------------|--------|
| 28 | Success Color | WL → Global → Success | `themeConfig.global.successColor` | `--success-color` | **None** (hardcoded Tailwind greens) | DISCONNECTED |
| 29 | Error Color | WL → Global → Error | `themeConfig.global.errorColor` | `--error-color` | **None** (hardcoded Tailwind reds) | DISCONNECTED |
| 30 | Warning Color | WL → Global → Warning | `themeConfig.global.warningColor` | `--warning-color` | **None** (hardcoded Tailwind yellows) | DISCONNECTED |

---

## 2. Points System Settings (5 total)

| # | Setting | Admin Location | API Field | Mechanism | Component(s) | Status |
|---|---------|---------------|-----------|-----------|---------------|--------|
| 31 | Points Name | Points → Name | `pointsConfig.name` | useTheme hook | Header, WalletDrawer, Dashboard, PlayerCard, BetSlip | CONNECTED |
| 32 | Points Enabled | Points → Toggle | `pointsConfig.enabled` | **Not exposed by useTheme** | **None** (always shown) | DISCONNECTED |
| 33 | Reset Schedule | Points → Reset | `pointsConfig.resetSchedule` | **Not exposed** | **None** (no cron/scheduler) | DISCONNECTED |
| 34 | Referral Enabled | Points → Referral Toggle | `pointsConfig.referralEnabled` | **Not exposed** | **None** (PointsService orphaned) | DISCONNECTED |
| 35 | Referral Percentage | Points → Referral % | `pointsConfig.referralPercentage` | **Not exposed** | **None** (PointsService orphaned) | DISCONNECTED |

---

## 3. Fee System Settings (4 total)

| # | Setting | Admin Location | API Endpoint | Mechanism | Component(s) | Status |
|---|---------|---------------|-------------|-----------|---------------|--------|
| 36 | Fee BPS | Fees → Fee % | `/api/config/fees` → `feeBps` | useFeeCollection | BetSlip (via home.tsx) | CONNECTED |
| 37 | Fee Address (single) | Fees → Wallet Address | `/api/config/fees` → `feeAddress` | useFeeCollection | BetSlip (via home.tsx) | CONNECTED |
| 38 | Multi-Wallet Distribution | Fees → Wallet List + % | `/api/config/fees` → **only wallets[0]** | useFeeCollection (single wallet only) | **Partial** — only first wallet works | DISCONNECTED |
| 39 | Show Fee in UI | **Not in admin** | **Not in API** | Hardcoded `true` in home.tsx | BetSlip `showFeeInUI` prop | DISCONNECTED |

---

## Summary Statistics

| Status | Count | Percentage |
|--------|-------|------------|
| CONNECTED | 16 | 41% |
| DISCONNECTED | 23 | 59% |
| **Total** | **39** | — |

> Note: The "39" total includes 3 general-purpose theme settings (#28-30) plus 1 implicit fee setting (#39) beyond the original ~35 estimate.

---

## Before/After Manual Test Plan

### Current State (Broken) — Verify Disconnects

| Test | Steps | Expected (Current - Broken) |
|------|-------|---------------------------|
| Sorting Bar Color | Admin → WL → Sorting Bar → Active Tab → set `#00ff88` → Save | Sort tabs stay default color (NO change) |
| Logo URL | Admin → WL → Brand → Logo URL → paste URL → Save | Header shows text only (NO logo image) |
| Points Toggle | Admin → Points → Disable toggle → Save | Points still visible everywhere (NO change) |
| Market Totals Accent | Admin → WL → Markets → Totals Accent → set `#ff0000` → Save | Totals stripe stays default blue (NO change) |
| BetSlip Success Color | Admin → WL → BetSlip → Success → set `#ff00ff` → Save | Success state stays emerald green (NO change) |
| Multi-Wallet Fees | Admin → Fees → Add 2 wallets (60%/40%) → Save | Only wallet #1 receives 100% of fees |
| Global Error Color | Admin → WL → Global → Error → set `#0000ff` → Save | Error messages stay red (NO change) |

### Target State (Fixed) — Verify After Fixes

| Test | Steps | Expected (Fixed) |
|------|-------|--------------------|
| Sorting Bar Color | Admin → WL → Sorting Bar → Active Tab → set `#00ff88` → Save | Active sort tab turns neon green |
| Logo URL | Admin → WL → Brand → Logo URL → paste URL → Save | Logo image appears in header |
| Points Toggle | Admin → Points → Disable toggle → Save | All points displays hidden throughout app |
| Market Totals Accent | Admin → WL → Markets → Totals Accent → set `#ff0000` → Save | Totals market stripe turns red |
| BetSlip Success Color | Admin → WL → BetSlip → Success → set `#ff00ff` → Save | Success confirmation turns magenta |
| Multi-Wallet Fees | Admin → Fees → Add 2 wallets (60%/40%) → Save | Wallet #1 gets 60%, Wallet #2 gets 40% of fee |
| Global Error Color | Admin → WL → Global → Error → set `#0000ff` → Save | Error messages turn blue |

---

## Connected Settings — Quick Smoke Tests

These should already work. Use to confirm no regressions.

| Test | Steps | Expected |
|------|-------|----------|
| Brand Name | Admin → WL → Brand → Name → "MYAPP" → Save | Header shows "MYAPP", page title changes |
| Header BG | Admin → WL → Header → BG → `#1a1a2e` → Save | Header background turns dark blue |
| Header Text | Admin → WL → Header → Text → `#e94560` → Save | Header text turns red |
| Nav Active | Admin → WL → Nav → Active → `#00ff00` → Save | Active nav icon turns green |
| Market BG | Admin → WL → Markets → BG → `#2d2d44` → Save | Market cards turn dark purple |
| Market Moneyline | Admin → WL → Markets → ML Accent → `#ff6600` → Save | Moneyline accent stripe turns orange |
| BetSlip BG | Admin → WL → BetSlip → BG → `#1a1a2e` → Save | BetSlip background turns dark blue |
| BetSlip Primary | Admin → WL → BetSlip → Primary → `#00cc88` → Save | Place Bet button turns teal |
| Fee BPS | Admin → Fees → Fee → 2% → Save | BetSlip shows 2% fee breakdown |
| Points Name | Admin → Points → Name → "TOKENS" → Save | All "WILD" labels change to "TOKENS" |
