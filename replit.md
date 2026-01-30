# Wildcard Sports Prediction Terminal

## Overview
Wildcard is a sports prediction terminal application with a HUD-style dark interface. Its primary purpose is to provide a platform for gasless betting using the Polymarket Builder Relayer pattern, player scouting with funding curves, and real-time trading. The project aims to deliver a fully functional MVP with core features including live betting markets, player launchpads, token trading, and a user dashboard.

## User Preferences
The user prefers a dark-themed interface with neon accents.

## System Architecture

### Frontend (client/)
- **Framework**: React with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **Styling**: Tailwind CSS with a custom design system, including `design_guidelines.md` for specifications.
- **UI/UX**: Zinc-950 dark mode with specific color accents (rose, emerald, blue, amber) and fonts (Inter, JetBrains Mono) for a terminal-like experience.
- **Key Features**:
    - **Predict Tab**: Displays live betting markets with 3-way odds. Core markets (moneyline, totals) are prominently displayed, while other markets are in an expandable "More Markets" section.
    - **Scout Tab**: Features a player launchpad with funding progress bars.
    - **Trade Tab**: Provides an interface for player token trading.
    - **Dashboard**: Shows wallet balances, betting history, and position tracking with the ability to claim winnings. It includes an Activity tab displaying trade history from Polymarket.
    - **Admin CMS**: An `/admin` route for managing demo data, including a Sport Config Editor for dynamic market type discovery and configuration.
    - **Betting Mechanics**: Supports placing limit orders on Polymarket CLOB. The BetSlip dynamically shows outcome-specific labels and provides inline success/error panels for bet confirmation.
    - **Live Data**: Uses WebSockets for real-time price updates for all market displays.

### Backend (server/)
- **Framework**: Express.js
- **Storage**: PostgreSQL with Drizzle ORM for data persistence.
- **API**: RESTful endpoints prefixed with `/api/*` for markets, players, bets, trades, wallet, and Polymarket integrations.

### Shared (shared/)
- **Schema**: Zod schemas for type validation.
- **Types**: TypeScript types derived from schemas.

### Core Architectural Decisions
- **Polymarket Integration**: Utilizes Polymarket for betting markets. Order submission happens client-side via the ClobClient SDK due to Cloudflare protection, while the server stores order records for tracking. The Polymarket Builder Relayer pattern is used for gasless betting, including remote signing for Safe wallet operations.
- **Dynamic Content**: The Sport Config Editor allows dynamic discovery and configuration of market types per sport, mapping API fields to UI elements and defining outcome strategies.
- **Geo-Blocking Handling**: The application recognizes Polymarket's geo-restrictions for trading/orders and reflects this as "no liquidity available" where applicable, while still allowing market viewing.
- **Team Abbreviation Parsing**: Team and player abbreviations are consistently derived from Polymarket event slugs for display across the application.
- **Wild Points System**: $WILD points are calculated from Polymarket Activity API data, with an admin panel for auditing and management.
- **Position Status**: Enhanced position statuses in the Dashboard, distinguishing between "WON", "LOST", and "PENDING" (won but not yet redeemable) based on Polymarket Data API.
- **Integrator Fee System**: Supports optional fee collection via the Polymarket Builder Program using a pre-collection approach. Fees are collected BEFORE the order is submitted (not after), preventing users from rejecting the fee transaction after their bet is placed. If the order fails after fee collection, the fee is still collected. Configured via environment variables `VITE_INTEGRATOR_FEE_ADDRESS` (wallet to receive fees) and `VITE_INTEGRATOR_FEE_BPS` (fee in basis points, e.g., 50 = 0.5%). Currently set to 10 bps (0.1%).
- **Odds Refresh System**: BetSlip includes a refresh button for manual odds refresh, stale indicator when odds are >30 seconds old, and auto-refresh of stale odds before bet placement.

## External Dependencies
- **Polymarket**: Core platform for betting markets, including its CLOB API and Data API.
- **PostgreSQL**: Primary database for persistent storage.
- **Express.js**: Backend web application framework.
- **React**: Frontend JavaScript library for building user interfaces.
- **TypeScript**: Superset of JavaScript for type safety.
- **Wouter**: React-based routing library.
- **TanStack React Query**: Data fetching and state management library.
- **Tailwind CSS**: Utility-first CSS framework for styling.
- **Drizzle ORM**: TypeScript ORM for PostgreSQL.
- **Zod**: Schema declaration and validation library.
- **Privy**: Wallet and authentication solution (integrates with ethers v5 signer).
- **@nevuamarkets/poly-websockets**: Library for real-time price updates.