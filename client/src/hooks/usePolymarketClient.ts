import { useCallback, useState, useRef, useMemo } from "react";
import { ClobClient, Side, OrderType } from "@polymarket/clob-client";
import { RelayClient, RelayerTxType } from "@polymarket/builder-relayer-client";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { providers } from "ethers";
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  parseUnits,
  type Address,
} from "viem";
import { polygon } from "viem/chains";
import { useWallet } from "@/providers/PrivyProvider";

interface ApiKeyCreds {
  key: string;
  secret: string;
  passphrase: string;
}

type TickSize = "0.1" | "0.01" | "0.001" | "0.0001";

export interface OrderParams {
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  tickSize?: TickSize;
  negRisk?: boolean;
  orderMinSize?: number;
}

export interface OrderResult {
  success: boolean;
  orderID?: string;
  transactionsHashes?: string[];
  error?: string;
  status?: "matched" | "open" | "cancelled" | "failed" | "partial" | "partial_cancelled";
  filled?: boolean;
}

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  proxyAddress?: string;
  error?: string;
}

export interface PositionData {
  tokenId: string;
  size: number;
  avgPrice: number;
  side: string;
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
  bidDepth: number;  // Total $ available at best bid
  askDepth: number;  // Total $ available at best ask
  totalBidLiquidity: number;
  totalAskLiquidity: number;
  isLowLiquidity: boolean;
  isWideSpread: boolean;
}

const CLOB_HOST = "https://clob.polymarket.com";
const RELAYER_HOST = "https://relayer-v2.polymarket.com/";
const CHAIN_ID = 137; // Polygon mainnet

// Polygon contract addresses
const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as Address;
const CTF_ADDRESS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045" as Address;
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as Address;

// ERC20 ABI fragments
const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

// CTF ABI fragments
const CTF_ABI = [
  {
    name: "redeemPositions",
    type: "function",
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "parentCollectionId", type: "bytes32" },
      { name: "conditionId", type: "bytes32" },
      { name: "indexSets", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

export function usePolymarketClient() {
  const { eoaAddress, isReady, authenticated, getProvider } = useWallet();
  const [isInitializing, setIsInitializing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRelayerLoading, setIsRelayerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<ClobClient | null>(null);
  const relayClientRef = useRef<RelayClient | null>(null);
  const credsRef = useRef<ApiKeyCreds | null>(null);
  const addressRef = useRef<string | null>(null);
  const safeAddressRef = useRef<string | null>(null);
  const providerRef = useRef<unknown | null>(null);

  const initializeClient = useCallback(async (): Promise<ClobClient | null> => {
    if (clientRef.current && credsRef.current) {
      console.log("[PolymarketClient] Using cached client");
      return clientRef.current;
    }

    if (!isReady || !authenticated || !eoaAddress) {
      setError("Wallet not connected");
      return null;
    }

    setIsInitializing(true);
    setError(null);

    try {
      // Get the EIP-1193 provider from Privy via context
      const privyProvider = await getProvider();
      if (!privyProvider) {
        setError("Failed to get wallet provider");
        return null;
      }
      providerRef.current = privyProvider;

      // Wrap with ethers v5 Web3Provider
      const ethersProvider = new providers.Web3Provider(
        privyProvider as providers.ExternalProvider,
      );
      const signer = ethersProvider.getSigner();

      const address = await signer.getAddress();
      addressRef.current = address;
      console.log("[PolymarketClient] Connected wallet:", address);

      // Create initial client for deriving API credentials
      const initClient = new ClobClient(CLOB_HOST, CHAIN_ID, signer);

      // Derive or create API credentials (L1 auth - requires wallet signature)
      console.log("[PolymarketClient] Deriving API credentials...");
      const creds = await initClient.createOrDeriveApiKey();
      credsRef.current = creds;
      console.log("[PolymarketClient] API credentials obtained");

      // Create authenticated client with credentials
      // signatureType: 0 = EOA/Browser wallet
      const authenticatedClient = new ClobClient(
        CLOB_HOST,
        CHAIN_ID,
        signer,
        creds,
        0, // signatureType for EOA
        address, // funder address
      );

      clientRef.current = authenticatedClient;
      console.log("[PolymarketClient] Client initialized successfully");

      return authenticatedClient;
    } catch (err) {
      console.error("[PolymarketClient] Initialization error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to initialize client",
      );
      return null;
    } finally {
      setIsInitializing(false);
    }
  }, [isReady, authenticated, eoaAddress, getProvider]);

  const placeOrder = useCallback(
    async (params: OrderParams): Promise<OrderResult> => {
      setIsSubmitting(true);
      setError(null);

      try {
        // Validate price is within valid range
        if (params.price <= 0 || params.price >= 1) {
          const errorMsg = `Invalid price: ${params.price}. Must be between 0 and 1`;
          setError(errorMsg);
          return { success: false, error: errorMsg };
        }
        
        // Validate minimum order value using market's orderMinSize from Polymarket (in USDC)
        // Default to 5 if not specified (Polymarket's typical minimum)
        // orderMinSize is the minimum order value in USDC, not shares
        const minOrderValueUSDC = params.orderMinSize ?? 5;
        const orderValueUSDC = params.price * params.size;
        if (orderValueUSDC < minOrderValueUSDC) {
          const errorMsg = `Order value too small: $${orderValueUSDC.toFixed(2)}. Polymarket requires minimum $${minOrderValueUSDC} for this market.`;
          setError(errorMsg);
          return { success: false, error: errorMsg };
        }

        const client = await initializeClient();
        if (!client) {
          return {
            success: false,
            error: "Failed to initialize Polymarket client",
          };
        }

        console.log("[PolymarketClient] Placing order:", {
          tokenId: params.tokenId,
          price: params.price,
          size: params.size,
          side: params.side,
          orderValueUSDC: orderValueUSDC.toFixed(2),
          minOrderValueUSDC,
        });

        // Use createAndPostOrder for full order lifecycle
        const orderArgs = {
          tokenID: params.tokenId,
          price: params.price,
          side: params.side === "BUY" ? Side.BUY : Side.SELL,
          size: params.size,
        };

        const options = {
          tickSize: params.tickSize || "0.01",
          negRisk: params.negRisk ?? false,
        };

        // Use GTC (Good Till Cancelled) - for instant fills, caller should set price 
        // aggressively (bestAsk + buffer) so the order matches existing sell orders immediately
        const result = await client.createAndPostOrder(
          orderArgs,
          options,
          OrderType.GTC,
        );

        console.log("[PolymarketClient] Order result:", JSON.stringify(result, null, 2));

        // Check if order was successful
        const isSuccess = result.success !== false && !result.errorMsg;
        const orderID = result.orderID || result.id;
        
        // Determine order status - check if order was matched/filled or is sitting open
        // Polymarket returns status in various fields and in UPPERCASE (e.g., "FILLED", "OPEN")
        const rawStatus = result.orderDetails?.status || result.order?.status || result.status || "";
        const orderStatus = typeof rawStatus === "string" ? rawStatus.toLowerCase() : "";
        
        // Check for fills - Polymarket may return fill info in various ways
        const hasFills = !!(result.fills && result.fills.length > 0);
        const sizeFilled = parseFloat(result.orderDetails?.sizeFilled || result.sizeFilled || "0") || 0;
        const sizeRemaining = parseFloat(result.orderDetails?.sizeRemaining || result.sizeRemaining || "0") || 0;
        const hasPartialFill = sizeFilled > 0;
        const hasRemainder = sizeRemaining > 0;
        
        // Status-based fill detection
        const statusIsFilled = orderStatus === "matched" || orderStatus === "filled";
        
        // Order has some fills if status says so OR if there are actual fills
        const hasAnyFill = statusIsFilled || hasFills || hasPartialFill;
        
        // Determine if we need to cancel any remaining order:
        // 1. Cancel if explicitly open/live with zero fills
        // 2. Cancel if unknown/blank status with zero fills (be defensive)
        // 3. Cancel remainder if partial fill (has fills but also has remaining)
        const isExplicitlyOpen = orderStatus === "open" || orderStatus === "live";
        const isUnknownStatus = orderStatus === "" || orderStatus === "unknown";
        const noFillsAtAll = !hasFills && !hasPartialFill;
        
        // Need to cancel if: no fills and (open or unknown status), OR there's a remainder after partial fill
        const needsCancel = (noFillsAtAll && (isExplicitlyOpen || isUnknownStatus)) || (hasAnyFill && hasRemainder);
        
        console.log("[PolymarketClient] Order status:", orderStatus, "hasAnyFill:", hasAnyFill, "hasFills:", hasFills, "sizeFilled:", sizeFilled, "sizeRemaining:", sizeRemaining, "needsCancel:", needsCancel);
        
        // If order needs cancellation (unfilled or has remainder), cancel it immediately
        // We want instant execution only - no orders sitting in the book
        if (isSuccess && orderID && needsCancel) {
          console.log("[PolymarketClient] Cancelling order (unfilled or has remainder)...", orderID);
          try {
            await client.cancelOrder({ orderID });
            console.log("[PolymarketClient] Order cancelled successfully");
            
            // Store order in database with appropriate status
            const dbStatus = hasAnyFill ? "partial_cancelled" : "cancelled";
            try {
              await fetch("/api/polymarket/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  order: {
                    tokenID: params.tokenId,
                    price: params.price,
                    size: params.size,
                    side: params.side,
                    orderType: "GTC",
                  },
                  walletAddress: addressRef.current,
                  polymarketOrderId: orderID,
                  status: dbStatus,
                  sizeFilled,
                  sizeRemaining,
                }),
              });
            } catch (dbErr) {
              console.warn("[PolymarketClient] Failed to store cancelled order:", dbErr);
            }
            
            // If there were any fills, report as partial fill with details
            // Otherwise report as not filled
            if (hasAnyFill) {
              return {
                success: true,
                status: "partial_cancelled",
                filled: true, // Partial fill - positions should refresh
                orderID,
                // Include fill info for UI messaging
                sizeFilled,
                sizeRemaining,
                isPartialFill: true,
              } as OrderResult & { sizeFilled: number; sizeRemaining: number; isPartialFill: boolean };
            } else {
              return {
                success: true,
                error: "Order not filled - not enough liquidity at current price. Try a smaller amount or wait for more liquidity.",
                status: "cancelled",
                filled: false,
                orderID,
              };
            }
          } catch (cancelErr) {
            console.error("[PolymarketClient] Failed to cancel order:", cancelErr);
            
            if (hasAnyFill) {
              // Partial fill but cancel failed - this is a problem, residual order is still open
              // Return as error so user knows to check manually
              return {
                success: false,
                error: `Order partially filled but could not cancel remainder. Order ${orderID} may still be open.`,
                status: "partial",
                filled: true,
                orderID,
                sizeFilled,
                sizeRemaining,
                isPartialFill: true,
              } as OrderResult & { sizeFilled: number; sizeRemaining: number; isPartialFill: boolean };
            } else {
              // No fills and cancel failed - order is still open
              return {
                success: false,
                error: `Order not filled and cancel failed. Order ${orderID} may still be open.`,
                status: "open",
                filled: false,
                orderID,
              };
            }
          }
        }
        
        // Store order in our database for tracking
        try {
          await fetch("/api/polymarket/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order: {
                tokenID: params.tokenId,
                price: params.price,
                size: params.size,
                side: params.side,
                orderType: "GTC",
              },
              walletAddress: addressRef.current,
              polymarketOrderId: orderID,
              status: hasAnyFill ? "matched" : (isSuccess ? "open" : "failed"),
            }),
          });
        } catch (dbErr) {
          console.warn(
            "[PolymarketClient] Failed to store order in DB:",
            dbErr,
          );
        }

        if (!isSuccess) {
          const errorMsg = result.errorMsg || "Order rejected by Polymarket";
          setError(errorMsg);
          return {
            success: false,
            error: errorMsg,
            status: "failed",
            filled: false,
          };
        }

        return {
          success: true,
          orderID: orderID,
          transactionsHashes: result.transactionsHashes,
          status: hasAnyFill ? "matched" : "open",
          filled: hasAnyFill,
        };
      } catch (err) {
        console.error("[PolymarketClient] Order error:", err);
        const errorMsg =
          err instanceof Error ? err.message : "Order submission failed";
        setError(errorMsg);
        
        // Store failed order in database for tracking
        try {
          await fetch("/api/polymarket/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order: {
                tokenID: params.tokenId,
                price: params.price,
                size: params.size,
                side: params.side,
                orderType: "GTC",
              },
              walletAddress: addressRef.current,
              polymarketOrderId: null,
              status: "failed",
            }),
          });
        } catch (dbErr) {
          console.warn("[PolymarketClient] Failed to store failed order:", dbErr);
        }
        
        return { success: false, error: errorMsg };
      } finally {
        setIsSubmitting(false);
      }
    },
    [initializeClient],
  );

  const getOpenOrders = useCallback(async (): Promise<unknown[]> => {
    try {
      const client = await initializeClient();
      if (!client) return [];

      const orders = await client.getOpenOrders();
      return orders || [];
    } catch (err) {
      console.error("[PolymarketClient] Failed to fetch open orders:", err);
      return [];
    }
  }, [initializeClient]);

  const cancelOrder = useCallback(
    async (orderId: string): Promise<boolean> => {
      try {
        const client = await initializeClient();
        if (!client) return false;

        await client.cancelOrder({ orderID: orderId });
        return true;
      } catch (err) {
        console.error("[PolymarketClient] Failed to cancel order:", err);
        return false;
      }
    },
    [initializeClient],
  );

  const getWalletAddress = useCallback(async (): Promise<string | null> => {
    if (addressRef.current) return addressRef.current;

    if (!isReady || !authenticated) return null;

    try {
      const privyProvider = await getProvider();
      if (!privyProvider) return null;
      const ethersProvider = new providers.Web3Provider(
        privyProvider as providers.ExternalProvider,
      );
      const signer = ethersProvider.getSigner();
      const address = await signer.getAddress();
      addressRef.current = address;
      return address;
    } catch {
      return null;
    }
  }, [isReady, authenticated, getProvider]);

  const initializeRelayClient =
    useCallback(async (): Promise<RelayClient | null> => {
      if (relayClientRef.current) {
        console.log("[PolymarketClient] Using cached relay client");
        return relayClientRef.current;
      }

      if (!isReady || !authenticated) {
        setError("Wallet not connected");
        return null;
      }

      setIsRelayerLoading(true);
      setError(null);

      try {
        const privyProvider = await getProvider();
        if (!privyProvider) {
          setError("Failed to get wallet provider");
          return null;
        }

        // Create viem wallet client for RelayClient
        const viemWallet = createWalletClient({
          chain: polygon,
          transport: custom(privyProvider as any),
        });

        const [address] = await viemWallet.getAddresses();
        addressRef.current = address;

        // Configure Builder with remote signing via our server endpoint
        const builderConfig = new BuilderConfig({
          remoteBuilderConfig: {
            url: "/api/polymarket/sign",
          },
        });

        const relayClient = new RelayClient(
          RELAYER_HOST,
          CHAIN_ID,
          viemWallet,
          builderConfig,
          RelayerTxType.SAFE,
        );

        relayClientRef.current = relayClient;
        console.log("[PolymarketClient] RelayClient initialized");

        return relayClient;
      } catch (err) {
        console.error(
          "[PolymarketClient] RelayClient initialization error:",
          err,
        );
        setError(
          err instanceof Error
            ? err.message
            : "Failed to initialize RelayClient",
        );
        return null;
      } finally {
        setIsRelayerLoading(false);
      }
    }, [isReady, authenticated, getProvider]);

  const deploySafe = useCallback(async (): Promise<TransactionResult> => {
    setIsRelayerLoading(true);
    setError(null);

    try {
      const relayClient = await initializeRelayClient();
      if (!relayClient) {
        return { success: false, error: "Failed to initialize RelayClient" };
      }

      console.log("[PolymarketClient] Deploying Safe wallet...");
      const deployResponse = await relayClient.deploy();
      const result = await deployResponse.wait();

      if (result?.proxyAddress) {
        safeAddressRef.current = result.proxyAddress;
        console.log("[PolymarketClient] Safe deployed:", result.proxyAddress);
        return { success: true, proxyAddress: result.proxyAddress };
      }

      return { success: false, error: "Safe deployment failed" };
    } catch (err) {
      console.error("[PolymarketClient] Safe deployment error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Deploy failed",
      };
    } finally {
      setIsRelayerLoading(false);
    }
  }, [initializeRelayClient]);

  const approveUSDC = useCallback(async (): Promise<TransactionResult> => {
    setIsRelayerLoading(true);
    setError(null);

    try {
      const relayClient = await initializeRelayClient();
      if (!relayClient) {
        return { success: false, error: "Failed to initialize RelayClient" };
      }

      console.log("[PolymarketClient] Approving USDC for CTF Exchange...");

      const approvalData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [
          CTF_EXCHANGE,
          BigInt(
            "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          ),
        ],
      });

      const approvalTx = {
        to: USDC_ADDRESS,
        value: "0",
        data: approvalData,
      };

      const response = await relayClient.execute(
        [approvalTx],
        "Approve USDC for trading",
      );
      const result = await response.wait();

      console.log("[PolymarketClient] USDC approval result:", result);
      return { success: true, txHash: result?.transactionHash };
    } catch (err) {
      console.error("[PolymarketClient] USDC approval error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Approval failed",
      };
    } finally {
      setIsRelayerLoading(false);
    }
  }, [initializeRelayClient]);

  const withdrawUSDC = useCallback(
    async (amount: number, toAddress: string): Promise<TransactionResult> => {
      setIsRelayerLoading(true);
      setError(null);

      try {
        // Validate inputs
        if (!amount || amount <= 0) {
          return { success: false, error: "Invalid withdrawal amount" };
        }
        if (!toAddress || !/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
          return { success: false, error: "Invalid destination address" };
        }

        const relayClient = await initializeRelayClient();
        if (!relayClient) {
          return {
            success: false,
            error:
              "Failed to initialize RelayClient. Please ensure your wallet is connected.",
          };
        }

        console.log("[PolymarketClient] Withdrawing USDC from Safe wallet...", {
          amount,
          toAddress,
        });

        // USDC has 6 decimals on Polygon
        const amountWei = parseUnits(amount.toString(), 6);

        // Encode ERC20 transfer - RelayClient will execute this from the user's Safe wallet
        const transferData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [toAddress as Address, amountWei],
        });

        const transferTx = {
          to: USDC_ADDRESS,
          value: "0",
          data: transferData,
        };

        // RelayClient.execute() submits the transaction from the user's Safe wallet
        const response = await relayClient.execute(
          [transferTx],
          "Withdraw USDC",
        );
        const result = await response.wait();

        console.log("[PolymarketClient] Withdrawal result:", result);
        return { success: true, txHash: result?.transactionHash };
      } catch (err) {
        console.error("[PolymarketClient] Withdrawal error:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Withdrawal failed";
        // Provide more helpful error messages
        if (errorMessage.includes("insufficient funds")) {
          return {
            success: false,
            error: "Insufficient USDC balance in Safe wallet",
          };
        }
        if (errorMessage.includes("safe not deployed")) {
          return {
            success: false,
            error: "Safe wallet not deployed. Please deploy your Safe first.",
          };
        }
        return { success: false, error: errorMessage };
      } finally {
        setIsRelayerLoading(false);
      }
    },
    [initializeRelayClient],
  );

  const redeemPositions = useCallback(
    async (
      conditionId: string,
      indexSets: number[] = [1, 2],
    ): Promise<TransactionResult> => {
      setIsRelayerLoading(true);
      setError(null);

      try {
        // Validate conditionId format (should be 0x-prefixed 32-byte hex)
        if (!conditionId || !/^0x[a-fA-F0-9]{64}$/.test(conditionId)) {
          return { success: false, error: "Invalid condition ID format" };
        }

        if (!indexSets || indexSets.length === 0) {
          return {
            success: false,
            error: "No index sets provided for redemption",
          };
        }

        const relayClient = await initializeRelayClient();
        if (!relayClient) {
          return {
            success: false,
            error:
              "Failed to initialize RelayClient. Please ensure your wallet is connected.",
          };
        }

        console.log(
          "[PolymarketClient] Redeeming positions from Safe wallet...",
          { conditionId, indexSets },
        );

        // parentCollectionId = 0x0 for standard binary markets (top-level positions)
        // For nested markets, this would be non-zero
        const parentCollectionId =
          "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

        // Encode CTF redeemPositions call
        // This redeems conditional tokens back to USDC after market resolution
        const redeemData = encodeFunctionData({
          abi: CTF_ABI,
          functionName: "redeemPositions",
          args: [
            USDC_ADDRESS,
            parentCollectionId,
            conditionId as `0x${string}`,
            indexSets.map(BigInt),
          ],
        });

        const redeemTx = {
          to: CTF_ADDRESS,
          value: "0",
          data: redeemData,
        };

        // RelayClient.execute() submits the transaction from the user's Safe wallet
        const response = await relayClient.execute(
          [redeemTx],
          "Redeem winning positions",
        );
        const result = await response.wait();

        console.log("[PolymarketClient] Redeem result:", result);
        return { success: true, txHash: result?.transactionHash };
      } catch (err) {
        console.error("[PolymarketClient] Redeem error:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Redeem failed";
        // Provide more helpful error messages
        if (
          errorMessage.includes("payout is zero") ||
          errorMessage.includes("nothing to redeem")
        ) {
          return {
            success: false,
            error: "No winning positions to redeem for this market",
          };
        }
        if (errorMessage.includes("condition not resolved")) {
          return { success: false, error: "Market has not been resolved yet" };
        }
        if (errorMessage.includes("safe not deployed")) {
          return {
            success: false,
            error: "Safe wallet not deployed. Please deploy your Safe first.",
          };
        }
        return { success: false, error: errorMessage };
      } finally {
        setIsRelayerLoading(false);
      }
    },
    [initializeRelayClient],
  );

  // Fetch order book for a specific token - no auth required
  const getOrderBook = useCallback(async (tokenId: string): Promise<OrderBookData | null> => {
    try {
      // Create a read-only client (no signer needed for public data)
      const readOnlyClient = new ClobClient(CLOB_HOST, CHAIN_ID);
      
      console.log("[PolymarketClient] Fetching order book for token:", tokenId);
      const book = await readOnlyClient.getOrderBook(tokenId);
      
      if (!book) {
        console.warn("[PolymarketClient] No order book data returned");
        return null;
      }
      
      // Parse bids and asks
      const bids: OrderBookLevel[] = (book.bids || []).map((b: { price: string; size: string }) => ({
        price: parseFloat(b.price),
        size: parseFloat(b.size),
      }));
      
      const asks: OrderBookLevel[] = (book.asks || []).map((a: { price: string; size: string }) => ({
        price: parseFloat(a.price),
        size: parseFloat(a.size),
      }));
      
      // Sort: bids descending (highest first), asks ascending (lowest first)
      bids.sort((a, b) => b.price - a.price);
      asks.sort((a, b) => a.price - b.price);
      
      const bestBid = bids.length > 0 ? bids[0].price : 0;
      const bestAsk = asks.length > 0 ? asks[0].price : 1;
      const spread = bestAsk - bestBid;
      const midPrice = (bestAsk + bestBid) / 2;
      const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;
      
      // Calculate depth at best prices (in $)
      const bidDepth = bids.length > 0 ? bids[0].size * bids[0].price : 0;
      const askDepth = asks.length > 0 ? asks[0].size * asks[0].price : 0;
      
      // Total liquidity
      const totalBidLiquidity = bids.reduce((sum, b) => sum + b.size * b.price, 0);
      const totalAskLiquidity = asks.reduce((sum, a) => sum + a.size * a.price, 0);
      
      // Risk flags
      const isLowLiquidity = askDepth < 100; // Less than $100 at best ask
      const isWideSpread = spreadPercent > 5; // Spread wider than 5%
      
      console.log("[PolymarketClient] Order book:", {
        bestBid,
        bestAsk,
        spread,
        spreadPercent: spreadPercent.toFixed(2) + "%",
        askDepth: "$" + askDepth.toFixed(2),
        isLowLiquidity,
        isWideSpread,
      });
      
      return {
        bids,
        asks,
        bestBid,
        bestAsk,
        spread,
        spreadPercent,
        bidDepth,
        askDepth,
        totalBidLiquidity,
        totalAskLiquidity,
        isLowLiquidity,
        isWideSpread,
      };
    } catch (err) {
      console.error("[PolymarketClient] Failed to fetch order book:", err);
      return null;
    }
  }, []);

  const resetClient = useCallback(() => {
    clientRef.current = null;
    relayClientRef.current = null;
    credsRef.current = null;
    addressRef.current = null;
    safeAddressRef.current = null;
    setError(null);
  }, []);

  // Get the user's Safe address for deposits
  // USDC is deposited by sending directly to this address on Polygon
  const getSafeAddress = useCallback(async (): Promise<string | null> => {
    // Return cached Safe address if available
    if (safeAddressRef.current) {
      return safeAddressRef.current;
    }

    // Initialize RelayClient to get Safe address
    const relayClient = await initializeRelayClient();
    if (!relayClient) {
      return null;
    }

    return safeAddressRef.current;
  }, [initializeRelayClient]);

  return {
    placeOrder,
    getOpenOrders,
    cancelOrder,
    getOrderBook,
    getWalletAddress,
    getSafeAddress,
    initializeClient,
    initializeRelayClient,
    deploySafe,
    approveUSDC,
    withdrawUSDC,
    redeemPositions,
    resetClient,
    isInitializing,
    isSubmitting,
    isRelayerLoading,
    error,
    isReady: isReady && authenticated,
    hasCredentials: !!credsRef.current,
    safeAddress: safeAddressRef.current,
  };
}
