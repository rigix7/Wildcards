#!/bin/bash

echo "========================================="
echo "WILDCARDS HARDCODED VALUES SEARCH REPORT"
echo "========================================="
echo ""
echo "Generated: $(date)"
echo ""

echo "==========================================="
echo "1. HARDCODED HEX COLORS"
echo "==========================================="
echo ""
echo "Searching for #RRGGBB patterns in components and pages..."
echo ""
grep -rn "#[0-9a-fA-F]\{6\}" client/src/components client/src/pages --include="*.tsx" --include="*.ts" | \
  grep -v "admin.tsx" | \
  grep -v "node_modules" | \
  grep -v ".git" | \
  grep -v "ThemeProvider" || echo "No hardcoded hex colors found (good!)"

echo ""
echo "==========================================="
echo "2. HARDCODED TAILWIND BACKGROUND COLORS"
echo "==========================================="
echo ""
echo "Searching for bg-* classes that should use CSS variables..."
echo ""
grep -rn "bg-zinc-[0-9]\|bg-gray-[0-9]\|bg-slate-[0-9]\|bg-black\|bg-white\|bg-\[#" client/src/components client/src/pages --include="*.tsx" | \
  grep -v "admin.tsx" | \
  grep -v "node_modules" | \
  grep -v ".git" || echo "No hardcoded bg colors found (good!)"

echo ""
echo "==========================================="
echo "3. HARDCODED TAILWIND TEXT COLORS"
echo "==========================================="
echo ""
echo "Searching for text-* classes that should use CSS variables..."
echo ""
grep -rn "text-zinc-[0-9]\|text-gray-[0-9]\|text-slate-[0-9]\|text-white\|text-black\|text-\[#" client/src/components client/src/pages --include="*.tsx" | \
  grep -v "admin.tsx" | \
  grep -v "node_modules" | \
  grep -v ".git" || echo "No hardcoded text colors found (good!)"

echo ""
echo "==========================================="
echo "4. HARDCODED TAILWIND BORDER COLORS"
echo "==========================================="
echo ""
echo "Searching for border-* classes that should use CSS variables..."
echo ""
grep -rn "border-zinc-[0-9]\|border-gray-[0-9]\|border-slate-[0-9]\|border-white\|border-black\|border-\[#" client/src/components client/src/pages --include="*.tsx" | \
  grep -v "admin.tsx" | \
  grep -v "node_modules" | \
  grep -v ".git" || echo "No hardcoded border colors found (good!)"

echo ""
echo "==========================================="
echo "5. HARDCODED FEE VALUES"
echo "==========================================="
echo ""
echo "Searching for fee-related hardcoded values..."
echo ""
echo "--- Fee percentages (0.001, 0.01, etc) ---"
grep -rn "0\.001\|0\.01\|0\.1\|fee.*=.*0\." client/src --include="*.tsx" --include="*.ts" | \
  grep -v "admin.tsx" | \
  grep -v "node_modules" | \
  grep -v ".git" || echo "No hardcoded fee percentages found"

echo ""
echo "--- Fee constants (FEE_BPS, FEE_PERCENTAGE, etc) ---"
grep -rn "const.*FEE\|FEE.*=\|feeBps.*=.*[0-9]" client/src --include="*.tsx" --include="*.ts" | \
  grep -v "admin.tsx" | \
  grep -v "node_modules" | \
  grep -v ".git" | \
  grep -v "feeConfig\|useQuery" || echo "No hardcoded fee constants found"

echo ""
echo "==========================================="
echo "6. HARDCODED ETHEREUM ADDRESSES"
echo "==========================================="
echo ""
echo "Searching for 0x... addresses that should come from config..."
echo ""
grep -rn "0x[a-fA-F0-9]\{40\}" client/src --include="*.tsx" --include="*.ts" | \
  grep -v "admin.tsx" | \
  grep -v "node_modules" | \
  grep -v ".git" || echo "No hardcoded addresses found (good!)"

echo ""
echo "==========================================="
echo "7. HARDCODED BRAND/APP NAMES"
echo "==========================================="
echo ""
echo "Searching for hardcoded 'WILDCARDS' text..."
echo ""
grep -rn "WILDCARDS\|WILDCARD\b" client/src/components client/src/pages --include="*.tsx" --include="*.ts" | \
  grep -v "admin.tsx" | \
  grep -v "ThemeProvider" | \
  grep -v "node_modules" | \
  grep -v ".git" || echo "No hardcoded brand names found (good!)"

echo ""
echo "Searching for hardcoded 'WILD' points name..."
echo ""
grep -rn '"WILD"' client/src/components client/src/pages --include="*.tsx" --include="*.ts" | \
  grep -v "admin.tsx" | \
  grep -v "node_modules" | \
  grep -v ".git" || echo "No hardcoded WILD references found"

echo ""
echo "==========================================="
echo "8. SUMMARY COUNTS"
echo "==========================================="
echo ""
echo "bg-zinc-* in components/terminal:"
grep -rc "bg-zinc-[0-9]" client/src/components/terminal --include="*.tsx" 2>/dev/null | grep -v ":0$"
echo ""
echo "bg-zinc-* in components/views:"
grep -rc "bg-zinc-[0-9]" client/src/components/views --include="*.tsx" 2>/dev/null | grep -v ":0$"
echo ""
echo "bg-zinc-* in pages (excl admin):"
grep -rc "bg-zinc-[0-9]" client/src/pages --include="*.tsx" 2>/dev/null | grep -v "admin" | grep -v ":0$"
echo ""
echo "text-white in components:"
grep -rc "text-white" client/src/components --include="*.tsx" 2>/dev/null | grep -v ":0$"
echo ""
echo "border-zinc-* in components:"
grep -rc "border-zinc-[0-9]" client/src/components --include="*.tsx" 2>/dev/null | grep -v ":0$"

echo ""
echo "========================================="
echo "END OF REPORT"
echo "========================================="
