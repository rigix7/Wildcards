export interface SDKConfig {
  builderApiKey: string;
  builderSecret: string;
  builderPassphrase: string;
  signingEndpoint: string;
  feeAddress?: string;
  feeBps?: number;
  chainId?: number;
}

export interface WalletAdapter {
  getAddress(): Promise<string>;
  signMessage(message: string): Promise<string>;
  getEthersSigner(): any;
  getViemWalletClient(): any;
}

export type TickSize = "0.1" | "0.01" | "0.001" | "0.0001";

export interface PlaceOrderParams {
  tokenId: string;
  side: "BUY" | "SELL";
  amount: number;
  tickSize?: TickSize;
  negRisk?: boolean;
}

export interface OrderResult {
  success: boolean;
  orderID?: string;
  transactionsHashes?: string[];
  error?: string;
  status?: "matched" | "open" | "cancelled" | "failed";
  filled?: boolean;
  feeCollected?: bigint;
}

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  proxyAddress?: string;
  error?: string;
  // Bridge withdrawal fields
  bridgeNote?: string;
}

export interface Position {
  conditionId: string;
  tokenId: string;
  size: number;
  avgPrice: number;
  side: string;
  outcomeLabel?: string;
  negRisk?: boolean;
  marketSlug?: string;
  question?: string;
}

export interface RedeemablePosition {
  conditionId: string;
  tokenId: string;
  outcomeLabel?: string;
  negRisk?: boolean;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBookData {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadPercent: number;
  bidDepth: number;
  askDepth: number;
  totalBidLiquidity: number;
  totalAskLiquidity: number;
  isLowLiquidity: boolean;
  isWideSpread: boolean;
}

export interface FeeCollectionResult {
  success: boolean;
  feeAmount: bigint;
  txHash?: string;
}

export interface SafeInfo {
  address: string;
  isDeployed: boolean;
}

export interface BalanceInfo {
  usdc: number;
  wrappedCollateral: number;
}
