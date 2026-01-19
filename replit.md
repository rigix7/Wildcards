# Wildcard Sports Prediction Terminal

## Overview
Wildcard is a sports prediction terminal application featuring a HUD-style dark interface. It provides gasless betting capabilities using the Polymarket Builder Relayer pattern, player scouting with funding curves, and real-time trading.

## Current State
- **MVP Complete**: All core tabs (Predict, Scout, Trade, Dashboard) functional
- **Database**: PostgreSQL with Drizzle ORM for persistent storage
- **Theme**: Zinc-950 dark mode with neon accents

## Project Architecture

### Frontend (client/)
- **Framework**: React with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **Styling**: Tailwind CSS with custom design system

### Backend (server/)
- **Framework**: Express.js
- **Storage**: PostgreSQL with Drizzle ORM (DatabaseStorage class)
- **API**: RESTful endpoints at /api/*

### Shared (shared/)
- **Schema**: Zod schemas for type validation
- **Types**: TypeScript types derived from schemas

## Key Features
1. **Predict Tab**: Live betting markets with 3-way odds
2. **Scout Tab**: Player launchpad with funding progress bars
3. **Trade Tab**: Player token trading interface
4. **Dashboard**: Wallet balances and betting history
5. **Admin CMS**: /admin route for managing demo data

## Design System
- See `design_guidelines.md` for complete design specifications
- Colors: wild-brand (rose), wild-scout (emerald), wild-trade (blue), wild-gold (amber)
- Fonts: Inter (sans), JetBrains Mono (mono)

## API Endpoints
- GET/POST /api/markets
- GET/POST /api/players
- POST /api/players/fund
- GET/POST /api/bets
- GET/POST /api/trades
- GET /api/wallet

### Polymarket CLOB Integration
- POST /api/polymarket/sign - Returns HMAC signature headers for Builder attribution (used by RelayClient remote signing)
- POST /api/polymarket/orders - Stores order records in database (order submission happens client-side via SDK to avoid Cloudflare blocks)
- GET /api/polymarket/positions/:address - Fetches user's tracked positions from database

**Important Architecture Note**: Order submission MUST happen client-side via ClobClient SDK because Polymarket's CLOB API uses Cloudflare protection that blocks server IPs. The server endpoint only stores order records for tracking.

### Polymarket SDK Integration (Client-side)
- usePolymarketClient hook (client/src/hooks/usePolymarketClient.ts):
  - **ClobClient**: Order placement via createAndPostOrder() with ethers v5 signer from Privy wallet
  - **RelayClient**: Safe wallet operations with remote Builder signing via /api/polymarket/sign
  - **placeOrder()**: Places limit orders on Polymarket CLOB with wallet signature
  - **getSafeAddress()**: Returns user's Safe wallet address for USDC deposits on Polygon
  - **withdrawUSDC()**: Transfers USDC from user's Safe wallet via ERC20 transfer
  - **redeemPositions()**: Claims winning positions via CTF.redeemPositions (binary markets: indexSets=[1,2], parentCollectionId=0x0)
  - **deploySafe()**: Deploys user's Gnosis Safe proxy wallet
  - **approveUSDC()**: Approves CTF Exchange for USDC spending

### Deposit Flow
USDC deposits work by sending USDC directly to the user's Safe wallet address on Polygon:
1. User clicks "Get Deposit Address" in Dashboard
2. System derives/fetches the Safe address via RelayClient
3. User sends USDC from exchange (Coinbase, Kraken) or wallet to the Safe address on Polygon network
4. Funds arrive in ~5 minutes with minimal fees (<$0.10)

## Sport Config Editor
The Admin panel includes a comprehensive Sport + Market Type Configuration system:
- **Dynamic Market Type Discovery**: Scans up to 50 events per sport to find ALL available market types (moneyline, spreads, totals, player props, etc.)
- **Sample API Data**: Fetches real sample market data for the selected sport+marketType combination
- **Field Mapping**: Configure which API fields map to title, button labels, bet slip
- **Line Display**: Configure how spread/total lines are displayed
- **Outcome Strategy**: Configure how outcome labels are formatted
- **Composite Unique Key**: Uses (sportSlug, marketType) composite key to prevent duplicate configs

Key API Endpoints:
- GET /api/admin/sport-market-types/:seriesId - Discovers all market types for a sport
- GET /api/admin/sport-sample-v2/:seriesId/:marketType - Gets sample market data
- GET/POST/DELETE /api/admin/sport-market-configs - CRUD for configurations

## Recent Changes
- Initial MVP implementation (January 2026)
- Created terminal-style UI components
- Built Admin CMS for data management
- Migrated to PostgreSQL database with Drizzle ORM (January 10, 2026)
- Auto-seeds 3 markets and 6 players on startup if database is empty
- Fixed NBA events not showing by adding gameStartTime fallback to event.startDate (January 12, 2026)
- Fixed Price Ticker sync with Match Day view using 5-day filter
- Added getShortOutcomeLabel() helper for concise futures outcome display
- Enlarged EventCard with more padding and description display
- Enhanced Sport Config Editor with comprehensive market type discovery (January 12, 2026)
  - Scans 50 events per sport instead of 20 for better market type coverage
  - Added v2 sample endpoint with 30-event search and full raw market data
  - UI shows market type count, labels, and configured status
- Implemented hybrid UI approach for EventCard (January 12, 2026)
  - Core markets (moneyline, spreads, totals) use polished styled UI
  - Additional markets (team totals, player props, etc.) in expandable "More Markets" section
  - Simplified view uses question text directly, collapsed by default
  - Only need to configure Sport Configs for 3 core market types per sport
- Enhanced additional markets and bet slip (January 12, 2026)
  - SimplifiedMarketRow displays all outcomes with prices as separate clickable buttons
  - BetSlip dynamically shows outcome-specific labels (e.g., player names, Over/Under) instead of static Yes/No
  - Fixed critical bug: additional market selections now use outcome tokenId instead of market conditionId
- Added event merging for duplicate Polymarket events (January 12, 2026)
  - Child events (with parentEventId like "More Markets") are now merged into their parent events
  - Markets, volume, and liquidity are consolidated from all child events
  - BetSlip correctly shows Yes/No for soccer binary markets vs team names for NBA 2-way markets
- Implemented Polymarket SDK integration for real betting (January 13, 2026)
  - Added polymarketOrders and polymarketPositions database tables for tracking
  - Created /api/polymarket/sign endpoint for Builder HMAC signatures (remote signing pattern)
  - Order submission via /api/polymarket/orders with Builder credential headers
  - Position tracking shows user's bets directly on EventCard with "Your Position" indicator
  - Dashboard updated with Positions section, Claim Winnings, and Withdraw functionality
  - Client-side polymarketOrder.ts utility for order submission and position fetching
- Fixed production build failure (January 13, 2026)
  - Added /api/health endpoint for deployment health checks
  - Created Solana shim packages in build script (script/build.ts) to handle Privy's optional peer dependencies
  - Shims provide stub exports for @solana/kit, @solana-program/system, @solana-program/token
  - Required because Privy bundles Solana support even though we only use EVM/Polygon
- Fixed Safe address derivation inconsistency (January 14, 2026)
  - Updated useSafeDeployment to use dynamic factory address from RelayClient.contractConfig instead of hardcoded value
  - Added deriveSafeFromRelayClient() function that gets factory address from RelayClient after initialization
  - This ensures Safe address is consistent between dashboard and trading session (both now show 0x8474...)
  - Safe address derivation is now async and happens after RelayClient is initialized
- Added social login options for Privy (January 16, 2026)
  - Enabled Google, Apple, Twitter login methods alongside email and wallet
  - Uses Privy's default OAuth credentials (can configure custom credentials in Privy Dashboard for production branding)
- Added "Powered by Polymarket" attribution (January 16, 2026)
  - Footer in Predict view links to polymarket.com for credibility and transparency
  - Uses Button component with ghost variant per design guidelines
- Fixed claimable positions detection (January 16, 2026)
  - Position status now uses `redeemable` field from Polymarket Data API as authoritative source
  - Winning resolved positions now correctly appear in Dashboard "Claim Winnings" section
  - See: https://docs.polymarket.com/developers/misc-endpoints/data-api-get-positions
- Enhanced bet confirmation UX (January 16, 2026)
  - BetSlip now shows prominent inline success/error panels after submission
  - Success panel: Large green checkmark, stake amount, "Done" button
  - Error panel: Red X icon, error message from API, "Try Again" button
  - Button lockout with spinner during "Submitting to Polymarket..." state
  - Positions refresh automatically on successful bet placement
  - Toast component has new success/error variants with colored borders and backgrounds
- Added Dashboard Activity tab with Polymarket activity history (January 16, 2026)
  - Fetches complete trade history from Polymarket Data API /activity endpoint
  - Shows BOUGHT (teal), SOLD (gold), CLAIMED (green) badges with amounts and timestamps
- Implemented real-time price updates via WebSocket (January 16, 2026)
  - Added useLivePrices hook using @nevuamarkets/poly-websockets package
  - Subscribes to visible market token IDs for live best_ask price updates
  - All market display components (SpreadMarketDisplay, TotalsMarketDisplay, MoneylineMarketDisplay, SoccerMoneylineDisplay, SimplifiedMarketRow) now use live prices
  - getLivePrice() helper falls back to static Gamma API prices when WebSocket data unavailable
  - 15-second delayed position refresh after successful bet placement to account for Polymarket API latency

- Implemented slug-based team abbreviation parsing (January 16, 2026)
  - Team/player abbreviations are now extracted from Polymarket event slugs
  - Slug format: `{league}-{homeAbbrev}-{awayAbbrev}-{date}` (e.g., "wta-sabalen-rakotom-2026-01-18")
  - Abbreviations can be 1-7 characters (e.g., "SABALEN", "INT", "MCI")
  - parseTeamAbbrevsFromEventSlug() extracts home/away abbreviations
  - Outcome-level abbrev field for 2-way markets (tennis, individual sports)
  - Consistent abbreviations across ticker, event cards, and bet slip
- Code housekeeping cleanup (January 16, 2026)
  - Removed unused /compare route and predict-compare.tsx page
  - Removed deprecated hardcoded team abbreviation maps (NFL_TEAM_ABBREVIATIONS, NBA_TEAM_ABBREVIATIONS)
  - Removed unused functions: getTeamAbbreviation(), fetchPolymarketSports(), fetchCategorizedTags
  - All terminal components in use: BetSlip, BottomNav, DemoBadge (Scout/Trade), Header, etc.
- Fixed Wild Points crediting system (January 19, 2026)
  - Wild Points now calculated from order history as source of truth (self-healing)
  - Added `getCalculatedWildPoints()` function that sums filled order amounts
  - Status check normalized to be case-insensitive and accept variations (filled, matched, executed, completed, success)
  - FOK orders: price=0 means size field contains stake amount directly
  - Limit orders: amount = price × size
  - Wallet endpoint returns calculated points instead of stored incremental value

## Geo-Blocking Behavior
Polymarket enforces geo-restrictions at the API level for trading/orders. Blocked countries include:
- Singapore, France, Switzerland, Poland, Romania, UK, Australia, Netherlands
- OFAC-sanctioned countries (Iran, Cuba, North Korea, Syria, etc.)

When geo-blocked, users see "no liquidity available" error. Viewing markets/prices still works.

## Team Abbreviation Parsing
Team and player abbreviations are derived from Polymarket event slugs to ensure consistency with official Polymarket display:
- **Slug Format**: `{league}-{homeAbbrev}-{awayAbbrev}-{date}`
- **Example**: `wta-sabalen-rakotom-2026-01-18` → SABALEN vs RAKOTOM
- **Example**: `sea-udi-int-2026-01-18` → UDI vs INT (Serie A: Udinese vs Inter)
- Abbreviations support 1-7 characters for flexibility across sports
- For 2-way markets (tennis), abbreviations are set at the outcome level
- For 3-way markets (soccer), abbreviations are matched via market slug suffix
