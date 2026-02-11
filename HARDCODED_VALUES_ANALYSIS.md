# Hardcoded Values Analysis Report

Generated: 2026-02-11

---

## Executive Summary

This report identifies all hardcoded values in the Wildcards codebase that should be configurable via the admin panel's theme system, fee configuration, or brand settings.

**Files searched:**
- `client/src/components/**/*.tsx` (terminal + views + ui)
- `client/src/pages/**/*.tsx`
- `client/src/**/*.ts`

**Excluded from search:**
- `admin.tsx` (contains legitimate preset definitions)
- `ThemeProvider.tsx` (contains default theme fallback values)
- `node_modules`

---

## Aggregate Counts

| Category | Total Occurrences | Files Affected |
|----------|------------------|----------------|
| `bg-zinc-*` backgrounds | ~145 | 15 files |
| `text-white` / `text-zinc-*` text | ~330 | 24 files |
| `border-zinc-*` borders | ~92 | 18 files |
| Hex color fallbacks (in CSS vars) | ~15 | 5 files |
| Hardcoded brand names | ~8 | 4 files |
| Hardcoded "WILD" points name | ~7 | 5 files |
| Hardcoded fee defaults | 5 | 3 files (all default to 0) |
| Hardcoded Ethereum addresses | ~28 | 7 files (protocol contracts) |

---

## Categorization

### CRITICAL - Theme Colors Not Connected

These are the **primary theming colors** that the admin panel controls but components still hardcode.

#### bg-zinc-* Backgrounds (145 occurrences)

**components/terminal/ (60 occurrences)**

| File | Count | Key Hardcoded Classes |
|------|-------|----------------------|
| `PlayerCard.tsx` | 19 | `bg-zinc-900`, `bg-zinc-800`, `bg-zinc-700` (skeletons + cards) |
| `WalletDrawer.tsx` | 10 | `bg-zinc-900`, `bg-zinc-950`, `bg-black/60` (drawer + overlay) |
| `BetSlip.tsx` | 9 | `bg-zinc-800`, `bg-zinc-900` (quick-bet buttons, summary) |
| `MarketCard.tsx` | 9 | `bg-zinc-950`, `bg-zinc-800`, `bg-zinc-900` (outcome btns, skeleton) |
| `DepositInstructions.tsx` | 7 | `bg-zinc-950`, `bg-zinc-900` (deposit panels) |
| `SubTabs.tsx` | 3 | `bg-zinc-950`, `bg-zinc-900`, `bg-zinc-800` (tab container) |
| `Header.tsx` | 2 | `bg-zinc-900/50`, `bg-zinc-800` (wallet button area) |
| `Toast.tsx` | 1 | Toast background |

**components/views/ (58 occurrences)**

| File | Count | Key Hardcoded Classes |
|------|-------|----------------------|
| `DashboardView.tsx` | 34 | `bg-zinc-950`, `bg-zinc-900`, `bg-zinc-800` throughout |
| `TradeView.tsx` | 12 | `bg-zinc-950`, `bg-zinc-800` (sort buttons, cards) |
| `PredictView.tsx` | 11 | `bg-zinc-900/80`, `bg-zinc-950`, `bg-zinc-800` (filter bar, cards) |
| `ScoutView.tsx` | 1 | Background color |

**pages/ (6 occurrences, excluding admin.tsx)**

| File | Count | Key Hardcoded Classes |
|------|-------|----------------------|
| `home.tsx` | 5 | `bg-zinc-900`, `bg-zinc-800/50` (sell modal, inputs) |
| `not-found.tsx` | 1 | `bg-zinc-950` (404 page) |

#### text-white / text-zinc-* (330 occurrences)

Top files by count (excluding admin.tsx, ui/):

| File | text-white | text-zinc-* | Total |
|------|-----------|-------------|-------|
| `DashboardView.tsx` | 26 | 54+ | ~80 |
| `PredictView.tsx` | 16 | 54+ | ~70 |
| `BetSlip.tsx` | 10 | 25+ | ~35 |
| `WalletDrawer.tsx` | 10 | 30+ | ~40 |
| `home.tsx` | 5+ | 20+ | ~25 |
| `DepositInstructions.tsx` | 7 | 15+ | ~22 |
| `TradeView.tsx` | 5 | 15+ | ~20 |

#### border-zinc-* (92 occurrences)

Top files:

| File | Count |
|------|-------|
| `DashboardView.tsx` | ~30 |
| `WalletDrawer.tsx` | ~10 |
| `home.tsx` | ~10 |
| `TradeView.tsx` | ~8 |
| `BetSlip.tsx` | ~7 |
| `PredictView.tsx` | ~7 |

---

### CRITICAL - Brand Names Hardcoded

#### "WILDCARD" in UI (should load from theme config)

| File | Line | Code |
|------|------|------|
| `Header.tsx` | 26 | `>WILDCARD</span>` |
| `not-found.tsx` | 11 | `>WILDCARD</span>` |

**Should use:** `theme.brand.name` from ThemeProvider or CSS variable

#### "WILD" Points Name (should be configurable)

| File | Line | Code |
|------|------|------|
| `Header.tsx` | 38 | `{formatBalance(wildBalance)} WILD` |
| `WalletDrawer.tsx` | 239 | `<span>WILD</span>` |
| `BetSlip.tsx` | 216 | `pointsName = "WILD"` (default param - OK) |
| `DashboardView.tsx` | 638 | `<div>WILD</div>` |
| `PlayerCard.tsx` | 62 | `Target: ... WILD` |
| `home.tsx` | 401 | `"Funded 500 WILD successfully!"` |

**Should use:** `pointsConfig.name` from admin panel (defaults to "WILD")

---

### HIGH - Fee System

The fee system is **already properly loading from the database** via `useFeeCollection` hook which calls `/api/config/fees`. The only hardcoded fee values are initialization defaults:

| File | Line | Value | Status |
|------|------|-------|--------|
| `useFeeCollection.ts` | 36 | `feeBps: 0` | OK - Initial state before API load |
| `sdk/PolymarketSDK.ts` | 104 | `feeBps: 0` | OK - SDK initialization default |
| `constants/config.ts` | 1-6 | `VITE_INTEGRATOR_FEE_*` | UNUSED - Not imported anywhere |

**Verdict:** Fee system is working correctly. `constants/config.ts` is dead code and can be removed.

---

### LOW - Ethereum Addresses (Protocol Infrastructure)

All 28 hardcoded addresses are **Polymarket protocol contracts** on Polygon mainnet. These are not user-configurable and should NOT come from the admin panel:

- `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` - USDC.e contract (duplicated 5x)
- `0x4d97dcd97ec945f40cf65f87097ace5ea0476045` - CTF contract (duplicated 3x)
- `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` - CTF Exchange (duplicated 3x)
- `0xC5d563A36AE78145C45a50134d48A1215220f80a` - NegRisk Exchange (duplicated 2x)
- `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` - NegRisk Adapter (duplicated 2x)
- `0x3A3BD7bb9528E159577F7C2e685CC81A765002E2` - Wrapped Collateral (duplicated 2x)

**Recommendation:** These are correctly hardcoded (they're protocol contracts) but are duplicated across `constants/tokens.ts`, `sdk/constants.ts`, `hooks/usePolymarketClient.ts`, and `lib/polygon.ts`. Consider centralizing to a single import source.

---

## Impact Assessment

### If we DON'T fix the theme colors:
- Admin panel theme changes have **partial effect** on the main app
- Header, BottomNav, BetSlip button, and MarketCard use theme variables (CONNECTED)
- BUT ~560 Tailwind color classes in other components remain hardcoded
- Preset themes like "Professional Blue" or "Neon Nights" will look inconsistent

### If we DON'T fix brand names:
- Header always says "WILDCARD" regardless of admin theme config
- Points system always shows "WILD" regardless of pointsConfig.name
- White-label operators can't fully rebrand

### Fee system:
- Already working correctly - loads from database via API

---

## Components Already Connected to Theme (from previous commit)

These components already use CSS variables:

| Component | Variables Used |
|-----------|--------------|
| `Header.tsx` | `--header-bg`, `--header-text`, `--header-accent` |
| `BottomNav.tsx` | `--nav-bg`, `--nav-active`, `--nav-inactive` |
| `BetSlip.tsx` | `--wl-betslip-bg`, `--wl-betslip-text`, `--betslip-primary` |
| `MarketCard.tsx` | `--market-bg`, `--market-border`, `--market-text`, `--market-moneyline` |
| `home.tsx` (layout) | `--header-bg` for outer container |

---

## Components NOT Connected to Theme (Need Work)

### Priority 1 - Core User-Facing (HIGH IMPACT)

| Component | bg-zinc | text-white/zinc | border-zinc | Est. Effort |
|-----------|---------|-----------------|-------------|-------------|
| `PredictView.tsx` | 11 | 70+ | 7 | Large - 74KB file |
| `DashboardView.tsx` | 34 | 80+ | 30+ | Large - 74KB file |
| `WalletDrawer.tsx` | 10 | 40+ | 10+ | Medium |
| `BetSlip.tsx` (remaining) | 9 | 25+ | 7 | Medium |
| `home.tsx` (sell modal) | 5 | 25+ | 10+ | Medium |

### Priority 2 - Secondary UI

| Component | bg-zinc | text-white/zinc | border-zinc | Est. Effort |
|-----------|---------|-----------------|-------------|-------------|
| `TradeView.tsx` | 12 | 20+ | 8 | Small |
| `SubTabs.tsx` | 3 | 1+ | 0 | Small |
| `DepositInstructions.tsx` | 7 | 22+ | 3 | Small |
| `PlayerCard.tsx` | 19 | 2+ | 3 | Small |
| `Toast.tsx` | 1 | 1+ | 0 | Tiny |

### Priority 3 - Edge Pages

| Component | bg-zinc | text-white/zinc | Est. Effort |
|-----------|---------|-----------------|-------------|
| `ScoutView.tsx` | 1 | 2+ | Tiny |
| `not-found.tsx` | 1 | 1 | Tiny |

---

## Recommended Fix Strategy

### Approach: Gradual CSS Variable Migration

Rather than replacing every single Tailwind class, use a **layered approach**:

**Layer 1 - Structural colors (backgrounds, borders):** Replace `bg-zinc-900`, `bg-zinc-950`, `border-zinc-800` with CSS variables for the major layout containers.

**Layer 2 - Content colors (text):** Most `text-zinc-400`, `text-zinc-500` references are for secondary/muted text. These could map to a single `--muted-text` variable rather than converting each individually.

**Layer 3 - Semantic colors:** Keep `text-wild-brand`, `text-wild-scout`, `text-wild-gold`, `bg-amber-*`, `bg-red-*`, `bg-teal-*` as-is. These are semantic/functional colors (success, error, warning, buy/sell) that should stay fixed regardless of theme.

### Patterns to Replace

**Pattern 1: Background containers**
```tsx
// Before
<div className="bg-zinc-900 border border-zinc-800">
// After
<div style={{ backgroundColor: 'var(--market-bg)', borderColor: 'var(--market-border)' }}>
```

**Pattern 2: Brand name**
```tsx
// Before
<span>WILDCARD</span>
// After (needs theme context or prop)
<span>{brandName || "WILDCARD"}</span>
```

**Pattern 3: Points name**
```tsx
// Before
{balance} WILD
// After
{balance} {pointsName}
```

---

## Files to Update (Prioritized)

### Must Fix (Brand Connection)
- [ ] `Header.tsx` - Brand name "WILDCARD" should come from theme
- [ ] `not-found.tsx` - Brand name "WILDCARD" should come from theme
- [ ] `Header.tsx` - "WILD" points name should come from config
- [ ] `WalletDrawer.tsx` - "WILD" points name should come from config
- [ ] `DashboardView.tsx` - "WILD" token name should come from config
- [ ] `PlayerCard.tsx` - "WILD" points name should come from config

### Should Fix (Theme Colors - High Impact)
- [ ] `PredictView.tsx` - Sorting bar bg, filter bar, market card containers
- [ ] `DashboardView.tsx` - Widget backgrounds, borders, text
- [ ] `WalletDrawer.tsx` - Drawer background, panels
- [ ] `BetSlip.tsx` - Quick-bet buttons, summary panel backgrounds
- [ ] `home.tsx` - Sell modal backgrounds

### Nice to Fix (Theme Colors - Lower Impact)
- [ ] `TradeView.tsx` - Trade list backgrounds
- [ ] `SubTabs.tsx` - Tab backgrounds
- [ ] `DepositInstructions.tsx` - Deposit UI panels
- [ ] `PlayerCard.tsx` - Card backgrounds (mostly skeleton states)
- [ ] `Toast.tsx` - Toast background
- [ ] `ScoutView.tsx` - Minor background
- [ ] `not-found.tsx` - Page background

### Can Remove (Dead Code)
- [ ] `constants/config.ts` - INTEGRATOR_FEE_* constants (unused, not imported anywhere)

---

## Success Criteria

After fixes are implemented, re-run `search-hardcoded.sh` and verify:

- [ ] Brand name loads from theme config (not hardcoded "WILDCARD")
- [ ] Points name loads from config (not hardcoded "WILD")
- [ ] Major layout containers use CSS variables
- [ ] Theme preset switches produce visually distinct results across all views
- [ ] Fee system continues to work (already connected)
- [ ] No regressions in component rendering

---

## Next Steps

1. Review this analysis
2. Decide which priority level to target (all, or just P1/P2)
3. Create a ThemeContext or hook to provide brand name + points name to components
4. Replace hardcoded colors in prioritized component list
5. Re-run search to verify progress
6. Test with different preset themes

---

**END OF ANALYSIS**
