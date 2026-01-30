# Fee Structure Documentation

## Overview

This document explains the fee collection mechanism used in the betting platform. Fees are deducted upfront from the user's bet amount, ensuring guaranteed fee collection on every bet placed.

## How It Works

### Fee Calculation

When a user places a bet, the platform deducts a small percentage as a fee before submitting the order to Polymarket.

**Formula:**
```
effectiveBetAmount = userStake × (1 - feeBps / 10000)
feeAmount = userStake × (feeBps / 10000)
```

**Example with 10 bps (0.1%) fee:**
- User enters: $100 stake
- Fee deducted: $100 × (10 / 10000) = $0.10
- Actual bet placed: $100 × (1 - 10/10000) = $99.90
- Fee sent to integrator wallet: $0.10

### Displayed Odds Adjustment

The BetSlip shows "effective odds" that account for the fee deduction, so users see their true potential return relative to their entered stake.

**Formula:**
```
displayedPotentialWin = effectiveBetAmount × marketOdds
effectiveOdds = displayedPotentialWin / userStake
```

**Example:**
- User stake: $100
- Market odds: 2.0x (50% probability)
- Fee: 10 bps (0.1%)
- Effective bet: $99.90
- Potential win: $99.90 × 2.0 = $199.80
- Effective odds shown: $199.80 / $100 = 1.998x

### Why This Approach?

1. **Guaranteed Fee Collection**: Fees are collected on every bet, regardless of outcome (win/lose)
2. **Simpler Implementation**: No need to track filled orders or make separate fee transfers
3. **Transparent**: Users see their true potential returns in the BetSlip
4. **Industry Standard**: Most sportsbooks bake fees into the odds

## Configuration

Fees are configured via environment variables:

```env
VITE_INTEGRATOR_FEE_ADDRESS=0x8d9d4DD0d64C608088D44F4488CE9e374b631A9B
VITE_INTEGRATOR_FEE_BPS=10
```

- `VITE_INTEGRATOR_FEE_ADDRESS`: Wallet address to receive collected fees
- `VITE_INTEGRATOR_FEE_BPS`: Fee in basis points (10 = 0.1%, 50 = 0.5%, 100 = 1%)

The server also exposes the fee configuration via `/api/config/fees` endpoint.

## Implementation Details

### BetSlip Component (`client/src/components/terminal/BetSlip.tsx`)

The BetSlip calculates and displays:
1. User's entered stake
2. Effective bet amount (stake minus fee)
3. Adjusted odds/potential win reflecting the fee deduction
4. Fee amount being collected

### Fee Collection Hook (`client/src/hooks/useFeeCollection.ts`)

The `useFeeCollection` hook handles:
1. Loading fee configuration from the API
2. Calculating fee amounts
3. Transferring fees to the integrator wallet via the Polymarket Builder Relayer

### Order Submission Flow

1. User enters stake amount in BetSlip
2. BetSlip calculates effective bet amount and fee
3. On confirm, the order is placed with the reduced bet amount
4. Fee is transferred to the integrator wallet via relay transaction
5. User sees success confirmation

## Code Changes Required for Sister Product

To implement this fee structure:

1. **Update BetSlip** to:
   - Calculate `effectiveBetAmount = stake * (1 - feeBps/10000)`
   - Display adjusted odds: `adjustedOdds = (effectiveBetAmount * marketOdds) / stake`
   - Show potential win as: `effectiveBetAmount * marketOdds`

2. **Update order submission** to:
   - Pass `effectiveBetAmount` instead of full stake to the order
   - Keep fee calculation based on original stake

3. **Configure fee environment variables** in your deployment

## Testing

To verify fee collection is working:
1. Place a bet with fee collection enabled
2. Check that the order amount is less than the entered stake
3. Verify fee transaction appears in the integrator wallet
4. Confirm displayed potential win matches: `effectiveBetAmount × odds`
