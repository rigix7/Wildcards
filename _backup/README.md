# UI Backup - Pre-Rollback

Created: January 17, 2026

## Purpose
This backup contains all UI improvements and components before rolling back to a working betting checkpoint.

## What's Backed Up

### Pages (client/src/pages/)
- `home.tsx` - Main terminal interface with Predict/Scout/Trade/Dashboard tabs
- `admin.tsx` - Admin CMS with Sport Config Editor, futures categories
- `not-found.tsx` - 404 page

### Terminal Components (client/src/components/terminal/)
- `BetSlip.tsx` - Enhanced bet slip with success/error panels, order book integration
- `BottomNav.tsx` - Navigation tabs
- `DepositInstructions.tsx` - Safe wallet deposit flow
- `EmptyState.tsx` - Empty state displays
- `Header.tsx` - Terminal header
- `MarketCard.tsx` - Market display cards
- `PlayerCard.tsx` - Scout player cards
- `SubTabs.tsx` - Match Day / Futures filtering
- `Toast.tsx` - Custom toast notifications
- `WalletDrawer.tsx` - Wallet drawer UI

### Views (client/src/components/views/)
- `PredictView.tsx` - Polymarket integration with league extraction
- `DashboardView.tsx` - Positions, activity, claim/withdraw
- `ScoutView.tsx` - Player scouting
- `TradeView.tsx` - Trading interface

### Hooks (client/src/hooks/)
- `useClobClient.ts` - CLOB API client
- `useClobOrder.ts` - Order placement
- `useTradingSession.ts` - Trading session management
- `useSafeDeployment.ts` - Safe wallet derivation
- `useLivePrices.ts` - WebSocket price updates
- `useOrderBooks.ts` - Order book fetching
- `useTokenApprovals.ts` - ERC20 approvals
- Other hooks...

### Providers (client/src/providers/)
- `PrivyProvider.tsx` - Privy auth with social login
- `PrivyInnerProvider.tsx` - Inner Privy context
- `WalletProvider.tsx` - Wallet state management
- `WalletContext.tsx` - Wallet context

### Utils & Lib (client/src/utils/, client/src/lib/)
- `session.ts` - Trading session storage
- `approvals.ts` - Token approval utilities
- `polymarketOrder.ts` - Order submission
- `polymarket.ts` - API utilities
- `polygon.ts` - Polygon network config
- `safe.ts` - Safe wallet utilities

### Server (server/)
- `routes.ts` - All API endpoints including futures categories, sport configs
- `storage.ts` - Database storage interface

### Schema (shared/)
- `schema.ts` - Database schema with all tables

## UI Features to Preserve

1. **Dual Filtering System**
   - Match Day: Dynamic league extraction from event data
   - Futures: Admin-managed categories from database

2. **Sport Config Editor**
   - Dynamic market type discovery (50 events per sport)
   - Sample API data preview
   - Field mapping configuration

3. **Enhanced BetSlip**
   - Success/error inline panels
   - Order book integration
   - Loading states

4. **Dashboard Features**
   - Activity tab with trade history
   - Positions display
   - Claim/Withdraw functionality

5. **Live Prices**
   - WebSocket price updates
   - Real-time market data

6. **Team Abbreviation Parsing**
   - Slug-based abbreviation extraction

## How to Restore After Rollback

After reverting to a working checkpoint:

1. First, test that betting works in the reverted version
2. Carefully copy back UI files one group at a time
3. Start with simple UI components (styling, layout)
4. Test after each restoration group
5. Be careful with hooks that touch order/signature logic

### Suggested Restoration Order
1. Terminal components (BetSlip, Toast, EmptyState, etc.)
2. Views (PredictView, DashboardView with UI only)
3. Pages (home.tsx, admin.tsx)
4. Server routes for admin features
5. Schema updates (if any new tables needed)

### Files to NOT Restore (may have SDK issues)
- Be careful with: `useClobClient.ts`, `useClobOrder.ts`, `useTradingSession.ts`
- These contain the credential derivation and order logic that may have issues
- Compare with working version before replacing
