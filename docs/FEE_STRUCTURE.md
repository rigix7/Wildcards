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

### Order Submission Flow (Atomic Pre-Collection)

**Important**: Fees are collected BEFORE the order is placed, not after. This prevents users from rejecting the fee transaction after their bet is already placed.

1. User enters stake amount in BetSlip
2. BetSlip calculates effective bet amount and fee
3. User clicks "Place Bet"
4. **Fee is collected first** via relay transaction
5. If fee collection fails/rejected, the order is NOT placed
6. If fee collection succeeds, the order is submitted to Polymarket
7. User sees success/failure confirmation

This "pre-collection" approach ensures:
- Users cannot game the system by rejecting fees after their bet is placed
- If the order fails after fee collection, the fee still covers platform operational costs
- Single user interaction (fee tx prompt) before order submission

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

---

# Changelog

## v2.0 - January 2026

### New Features

#### 1. Odds Refresh Button
Added a visible refresh button next to the odds display in BetSlip.

**Files Changed:**
- `client/src/components/terminal/BetSlip.tsx`

**Implementation:**
```tsx
// Add refresh button next to odds display
<button
  onClick={retryOrderBook}
  disabled={isLoadingBook || submissionStatus === "pending"}
  className={`mt-1 p-1.5 rounded transition-colors ${
    isOddsStale 
      ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30' 
      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-wild-gold'
  }`}
  title={isOddsStale ? "Refresh stale odds" : "Refresh odds"}
>
  <RefreshCw className={`w-4 h-4 ${isLoadingBook ? 'animate-spin' : ''}`} />
</button>
```

**Key Points:**
- Button is always visible next to odds
- Shows loading spinner while fetching
- Changes to amber/warning style when odds are stale

---

#### 2. Stale Odds Indicator
Shows visual warning when odds haven't been refreshed in 30+ seconds.

**Files Changed:**
- `client/src/components/terminal/BetSlip.tsx`

**Implementation:**
```tsx
// Track time for stale detection
const STALE_THRESHOLD_MS = 30000; // 30 seconds
const [currentTime, setCurrentTime] = useState(Date.now());

// Update currentTime every 10 seconds to check staleness
useEffect(() => {
  const interval = setInterval(() => {
    setCurrentTime(Date.now());
  }, 10000);
  return () => clearInterval(interval);
}, []);

const isOddsStale = lastFetchTime > 0 && (currentTime - lastFetchTime) > STALE_THRESHOLD_MS;
```

**UI Display:**
```tsx
// Show "stale" label next to odds
{isOddsStale && !isLoadingBook && (
  <span className="text-[10px] text-amber-400 animate-pulse">stale</span>
)}

// Dim odds when stale
<p className={`text-2xl font-black font-mono ${isOddsStale ? 'text-wild-gold/70' : 'text-wild-gold'}`}>
  {displayedOdds.toFixed(2)}
</p>
```

**Key Points:**
- Uses interval to update stale check every 10 seconds
- Shows pulsing "stale" label in amber
- Dims the odds value when stale
- Refresh button turns amber when stale

---

#### 3. Auto-Refresh on Bet Placement
Automatically refreshes stale odds before placing a bet.

**Files Changed:**
- `client/src/components/terminal/BetSlip.tsx`

**Implementation:**
```tsx
const handleConfirm = async () => {
  if (stakeNum <= 0) return;
  
  // Auto-refresh stale odds before placing bet
  if (isOddsStale && getOrderBook && currentTokenId) {
    console.log("[BetSlip] Odds are stale, refreshing before bet...");
    setIsLoadingBook(true);
    try {
      const freshBook = await getOrderBook(currentTokenId);
      if (freshBook) {
        setOrderBook(freshBook);
        setLastFetchTime(Date.now());
        lastFetchedTokenRef.current = currentTokenId;
      }
    } catch (err) {
      console.warn("[BetSlip] Failed to refresh stale odds:", err);
    } finally {
      setIsLoadingBook(false);
    }
  }
  
  // Continue with bet placement...
};
```

**Key Points:**
- Checks if odds are stale before placing bet
- Fetches fresh order book data
- Updates lastFetchTime to reset stale indicator
- Continues with bet placement after refresh

---

#### 4. Pre-Collection Fee Flow
Changed fee collection to happen BEFORE order placement, preventing users from rejecting fees after their bet is placed.

**Files Changed:**
- `client/src/pages/home.tsx`
- `client/src/hooks/useFeeCollection.ts`

**Before (Post-Collection - Vulnerable):**
```tsx
// OLD: Fee collected AFTER order - users could reject
const result = await submitOrder({ ... });
if (result.success && isFeeCollectionEnabled) {
  await collectFee(relayClient, amount); // User could reject this!
}
```

**After (Pre-Collection - Secure):**
```tsx
// NEW: Fee collected BEFORE order
let feeWasCollected = false;

if (isFeeCollectionEnabled && relayClient) {
  const feeResult = await collectFee(relayClient, feeBaseAmount);
  
  if (!feeResult.success) {
    return { success: false, error: "Fee collection failed. Please try again." };
  }
  
  if (feeResult.skipped) {
    feeWasCollected = false; // Fee disabled or zero
  } else {
    feeWasCollected = true; // Fee actually transferred
  }
}

// Only submit order after fee is collected
const result = await submitOrder({ ... });

// Show helpful message if order fails after fee was collected
if (!result.success && feeWasCollected) {
  return {
    ...result,
    error: (result.error || "Order failed") + " (Fee was collected - contact support if needed)"
  };
}
```

**Updated useFeeCollection.ts:**
```tsx
// Added 'skipped' field to track when fee was skipped vs actually collected
export type FeeCollectionResult = {
  success: boolean;
  feeAmount: bigint;
  txHash?: string;
  skipped?: boolean; // Fee was skipped (disabled or zero amount)
};

// Return skipped: true when fee is not actually transferred
if (!feeConfig.enabled) {
  return { success: true, feeAmount: BigInt(0), skipped: true };
}
```

**Key Points:**
- Fee is collected FIRST, before order submission
- If user rejects fee, order is NOT placed
- `feeWasCollected` tracks if fee was actually transferred (not just enabled)
- Shows helpful message if order fails after fee collection
- `skipped` field distinguishes between fee disabled vs fee failed

---

### Known Limitations

**True Atomicity Not Possible:**
- Polymarket CLOB orders are off-chain signed messages
- Fee transfer is an on-chain Safe relay transaction
- These cannot be batched into a single atomic transaction

**Edge Case - Order Fails After Fee:**
- If fee is collected but order submission fails, user loses the fee
- At 0.1% (10 bps), this is $0.10 on a $100 bet
- Error message directs users to contact support if needed

---

### Migration Checklist for Sister App

1. **Add stale detection state and interval** in BetSlip
2. **Add refresh button** next to odds display with stale styling
3. **Add auto-refresh logic** in handleConfirm before placing bet
4. **Move fee collection BEFORE order submission** in mutation function
5. **Add `skipped` field** to FeeCollectionResult type
6. **Track `feeWasCollected`** to show appropriate error messages
7. **Test the flow:**
   - Verify refresh button works
   - Verify stale indicator appears after 30 seconds
   - Verify fee is collected before order
   - Verify rejecting fee prevents order placement
