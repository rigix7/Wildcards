#!/bin/bash
# verify-connections.sh — Automated verification of admin panel → UI connections
# Checks whether CSS variables set by ThemeProvider are actually consumed by components,
# whether useTheme exports are used, and whether API response fields are read by clients.
#
# Usage: bash verify-connections.sh
# Run from the Wildcards project root directory.

set -euo pipefail

COMPONENTS_DIR="client/src/components"
HOOKS_DIR="client/src/hooks"
PAGES_DIR="client/src/pages"
PROVIDERS_DIR="client/src/providers"
CLIENT_SRC="client/src"

PASS=0
FAIL=0
WARN=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() {
  echo -e "  ${GREEN}PASS${NC} $1"
  PASS=$((PASS + 1))
}

fail() {
  echo -e "  ${RED}FAIL${NC} $1"
  FAIL=$((FAIL + 1))
}

warn() {
  echo -e "  ${YELLOW}WARN${NC} $1"
  WARN=$((WARN + 1))
}

check_css_var() {
  local var_name="$1"
  local description="$2"
  # Search for var(--name in component/page files (excluding ThemeProvider itself and index.css)
  local matches
  matches=$(grep -rl "var(${var_name}" "$COMPONENTS_DIR" "$PAGES_DIR" 2>/dev/null | grep -v "ThemeProvider" || true)
  if [ -n "$matches" ]; then
    local file_list
    file_list=$(echo "$matches" | xargs -I{} basename {} | sort -u | tr '\n' ', ' | sed 's/,$//')
    pass "$description → ${var_name} used in: ${file_list}"
  else
    fail "$description → ${var_name} set by ThemeProvider but NEVER used by any component"
  fi
}

check_hook_field() {
  local field_name="$1"
  local description="$2"
  # Search for the field being destructured or accessed from useTheme in components/pages
  local matches
  matches=$(grep -rl "$field_name" "$COMPONENTS_DIR" "$PAGES_DIR" 2>/dev/null | grep -v "useTheme\.\(ts\|js\)" | grep -v "admin\.tsx" || true)
  if [ -n "$matches" ]; then
    local file_list
    file_list=$(echo "$matches" | xargs -I{} basename {} | sort -u | tr '\n' ', ' | sed 's/,$//')
    pass "$description → $field_name used in: ${file_list}"
  else
    fail "$description → $field_name exposed by useTheme but NEVER used by any component"
  fi
}

echo "============================================"
echo "  Admin Panel Integration Verification"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
echo ""

# ─────────────────────────────────────────────
# 1. THEME SYSTEM — CSS Variables
# ─────────────────────────────────────────────
echo "─── 1. THEME SYSTEM: CSS Variables ───"
echo ""

echo "  Header:"
check_css_var "--header-bg"     "header.backgroundColor"
check_css_var "--header-text"   "header.textColor"
check_css_var "--header-accent" "header.accentColor"
echo ""

echo "  BetSlip:"
check_css_var "--wl-betslip-bg"   "betSlip.backgroundColor (legacy)"
check_css_var "--wl-betslip-text" "betSlip.textColor (legacy)"
check_css_var "--betslip-bg"      "betSlip.backgroundColor"
check_css_var "--betslip-card"    "betSlip.cardColor"
check_css_var "--betslip-primary" "betSlip.primaryButtonColor"
check_css_var "--betslip-success" "betSlip.successColor"
check_css_var "--betslip-text"    "betSlip.textColor"
echo ""

echo "  Market Cards:"
check_css_var "--market-bg"         "marketCards.backgroundColor"
check_css_var "--market-hover"      "marketCards.hoverColor"
check_css_var "--market-border"     "marketCards.borderColor"
check_css_var "--market-odds-badge" "marketCards.oddsBadgeColor"
check_css_var "--market-text"       "marketCards.textColor"
check_css_var "--market-moneyline"  "marketCards.moneylineAccent"
check_css_var "--market-totals"     "marketCards.totalsAccent"
check_css_var "--market-more"       "marketCards.moreMarketsAccent"
echo ""

echo "  Sorting Bar:"
check_css_var "--sort-bg"       "sortingBar.backgroundColor"
check_css_var "--sort-active"   "sortingBar.activeTabColor"
check_css_var "--sort-inactive" "sortingBar.inactiveTabColor"
echo ""

echo "  Bottom Nav:"
check_css_var "--nav-bg"       "bottomNav.backgroundColor"
check_css_var "--nav-active"   "bottomNav.activeColor"
check_css_var "--nav-inactive" "bottomNav.inactiveColor"
echo ""

echo "  General Purpose:"
check_css_var "--page-bg"          "general.pageBg"
check_css_var "--card-bg[^-]"      "general.cardBg"
check_css_var "--card-bg-elevated" "general.cardBgElevated"
check_css_var "--card-bg-hover"    "general.cardBgHover"
check_css_var "--text-primary"     "general.textPrimary"
check_css_var "--text-secondary"   "general.textSecondary"
check_css_var "--text-muted"       "general.textMuted"
check_css_var "--border-primary"   "general.borderPrimary"
check_css_var "--border-secondary" "general.borderSecondary"
check_css_var "--primary-color"    "brand.primaryColor"
check_css_var "--accent-color"     "brand.accentColor"
echo ""

echo "  Global Status Colors:"
check_css_var "--success-color" "global.successColor"
check_css_var "--error-color"   "global.errorColor"
check_css_var "--warning-color" "global.warningColor"
echo ""

# ─────────────────────────────────────────────
# 2. THEME SYSTEM — useTheme Hook Fields
# ─────────────────────────────────────────────
echo "─── 2. THEME SYSTEM: useTheme Hook ───"
echo ""

check_hook_field "brandName"  "brand.name"
check_hook_field "pointsName" "pointsConfig.name"
check_hook_field "logoUrl"    "brand.logoUrl"
check_hook_field "logoIcon"   "brand.logoIcon"
echo ""

# ─────────────────────────────────────────────
# 3. POINTS SYSTEM
# ─────────────────────────────────────────────
echo "─── 3. POINTS SYSTEM ───"
echo ""

# Check if pointsConfig.enabled is used anywhere in components (not admin)
POINTS_ENABLED=$(grep -rl "pointsConfig\.enabled\|pointsEnabled\|points.*enabled" "$COMPONENTS_DIR" "$PAGES_DIR" 2>/dev/null | grep -v "admin" || true)
if [ -n "$POINTS_ENABLED" ]; then
  pass "pointsConfig.enabled → checked by components"
else
  fail "pointsConfig.enabled → saved/returned but NO component checks this flag"
fi

# Check if resetSchedule is used
RESET_SCHEDULE=$(grep -rl "resetSchedule" "$COMPONENTS_DIR" "$PAGES_DIR" "$HOOKS_DIR" 2>/dev/null | grep -v "admin" || true)
if [ -n "$RESET_SCHEDULE" ]; then
  pass "pointsConfig.resetSchedule → used by client code"
else
  fail "pointsConfig.resetSchedule → saved/returned but NEVER used (no cron job exists)"
fi

# Check if referral system is connected
REFERRAL=$(grep -rl "referralEnabled\|referralPercentage\|PointsService" "$COMPONENTS_DIR" "$PAGES_DIR" 2>/dev/null | grep -v "admin" || true)
if [ -n "$REFERRAL" ]; then
  pass "Referral system → connected to components"
else
  fail "Referral system → PointsService.ts is orphaned, referralEnabled/referralPercentage unused"
fi
echo ""

# ─────────────────────────────────────────────
# 4. FEE SYSTEM
# ─────────────────────────────────────────────
echo "─── 4. FEE SYSTEM ───"
echo ""

# Check if useFeeCollection is imported by any component
FEE_HOOK=$(grep -rl "useFeeCollection" "$COMPONENTS_DIR" "$PAGES_DIR" 2>/dev/null || true)
if [ -n "$FEE_HOOK" ]; then
  local_list=$(echo "$FEE_HOOK" | xargs -I{} basename {} | sort -u | tr '\n' ', ' | sed 's/,$//')
  pass "feeConfig (feeBps + feeAddress) → useFeeCollection used in: ${local_list}"
else
  fail "feeConfig → useFeeCollection hook is never imported"
fi

# Check multi-wallet support
MULTI_WALLET=$(grep -c "wallets\[" "$HOOKS_DIR/useFeeCollection.ts" 2>/dev/null | tr -d '[:space:]' || echo "0")
if [ "${MULTI_WALLET:-0}" -gt 0 ] 2>/dev/null; then
  pass "Multi-wallet distribution → useFeeCollection supports multiple wallets"
else
  fail "Multi-wallet distribution → useFeeCollection only supports single feeAddress"
fi

# Check showFeeInUI
SHOW_FEE_DYNAMIC=$(grep -rl "showFeeInUI" "$HOOKS_DIR" 2>/dev/null || true)
SHOW_FEE_HARDCODED=$(grep "showFeeInUI={true}" "$PAGES_DIR/home.tsx" 2>/dev/null || true)
if [ -n "$SHOW_FEE_DYNAMIC" ]; then
  pass "showFeeInUI → dynamically loaded from config"
elif [ -n "$SHOW_FEE_HARDCODED" ]; then
  fail "showFeeInUI → HARDCODED as true in home.tsx, no admin toggle exists"
else
  warn "showFeeInUI → not found in codebase"
fi
echo ""

# ─────────────────────────────────────────────
# 5. LOGO RENDERING CHECK
# ─────────────────────────────────────────────
echo "─── 5. SPECIAL CHECKS ───"
echo ""

# Check if Header renders an <img> for logo
LOGO_IMG=$(grep -c "<img" "$COMPONENTS_DIR/terminal/Header.tsx" 2>/dev/null | tr -d '[:space:]' || echo "0")
if [ "${LOGO_IMG:-0}" -gt 0 ] 2>/dev/null; then
  pass "Logo rendering → Header.tsx contains <img> tag"
else
  fail "Logo rendering → Header.tsx has NO <img> tag (logoUrl/logoIcon never rendered)"
fi

# Check if SubTabs uses sorting-specific vars
SORT_IN_SUBTABS=$(grep -c "var(--sort-" "$COMPONENTS_DIR/terminal/SubTabs.tsx" 2>/dev/null | tr -d '[:space:]' || echo "0")
if [ "${SORT_IN_SUBTABS:-0}" -gt 0 ] 2>/dev/null; then
  pass "Sorting bar → SubTabs.tsx uses --sort-* variables"
else
  fail "Sorting bar → SubTabs.tsx uses generic vars instead of --sort-* (3 settings disconnected)"
fi

# Check document.title is set from brand name
DOC_TITLE=$(grep -c "document.title" "$PROVIDERS_DIR/ThemeProvider.tsx" 2>/dev/null | tr -d '[:space:]' || echo "0")
if [ "${DOC_TITLE:-0}" -gt 0 ] 2>/dev/null; then
  pass "Brand name → document.title set by ThemeProvider"
else
  fail "Brand name → document.title NOT set"
fi
echo ""

# ─────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────
echo "============================================"
echo "  RESULTS SUMMARY"
echo "============================================"
echo ""
echo -e "  ${GREEN}PASS:${NC} $PASS"
echo -e "  ${RED}FAIL:${NC} $FAIL"
echo -e "  ${YELLOW}WARN:${NC} $WARN"
echo ""
TOTAL=$((PASS + FAIL + WARN))
if [ "$TOTAL" -gt 0 ]; then
  PCT=$((PASS * 100 / TOTAL))
  echo "  Connection rate: ${PCT}% ($PASS/$TOTAL)"
else
  echo "  No checks executed"
fi
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}$FAIL disconnected settings found.${NC}"
  echo "  See ADMIN_INTEGRATION_FINDINGS.md for details and fix recommendations."
  exit 1
else
  echo -e "  ${GREEN}All settings are connected!${NC}"
  exit 0
fi
