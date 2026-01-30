import { useCallback, useState, useRef, useMemo } from "react";
import { ClobClient, Side, OrderType } from "@polymarket/clob-client";
import { RelayClient, RelayerTxType } from "@polymarket/builder-relayer-client";
import { getContractConfig } from "@polymarket/builder-relayer-client/dist/config";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { providers } from "ethers";
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  parseUnits,
  getCreate2Address,
  keccak256,
  encodeAbiParameters,
  createPublicClient,
  http,
  type Address,
} from "viem";

// Safe wallet init code hash for CREATE2 address derivation (from Polymarket SDK)
const SAFE_INIT_CODE_HASH = "0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf" as `0x${string}`;

// Derive Safe wallet address from EOA using CREATE2 (same as Polymarket SDK)
function deriveSafe(address: string, safeFactory: string): string {
  return getCreate2Address({
    bytecodeHash: SAFE_INIT_CODE_HASH,
    from: safeFactory as Address,
    salt: keccak256(encodeAbiParameters([{ name: 'address', type: 'address' }], [address as Address])),
  });
}
import { polygon } from "viem/chains";
import { useWallet } from "@/providers/WalletContext";
import useFeeCollection from "@/hooks/useFeeCollection";

interface ApiKeyCreds {
  key: string;
  secret: string;
  passphrase: string;
}

type TickSize = "0.1" | "0.01" | "0.001" | "0.0001";

export interface OrderParams {
  tokenId: string;
  side: "BUY" | "SELL";
  amount: number;  // For BUY: USDC amount to spend. For SELL: shares to sell
  tickSize?: TickSize;
  negRisk?: boolean;
  orderMinSize?: number;
  // Legacy fields for backwards compatibility
  price?: number;
  size?: number;
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
  // Bridge withdrawal fields
  bridgeNote?: string;
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
// NegRisk markets use WrappedCollateral instead of USDC
// See: https://github.com/Polymarket/neg-risk-ctf-adapter/blob/main/addresses.json
const WRAPPED_COLLATERAL_ADDRESS = "0x3A3BD7bb9528E159577F7C2e685CC81A765002E2" as Address;

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

// CTF ABI fragments - includes balanceOf for querying ERC-1155 token balances
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
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

// WrappedCollateral ABI - for unwrapping negRisk collateral back to USDC
// See: https://github.com/Polymarket/neg-risk-ctf-adapter
const WRAPPED_COLLATERAL_ABI = [
  {
    name: "withdraw",
    type: "function",
    inputs: [
      { name: "_amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

// NegRiskAdapter ABI - for winner-take-all markets (soccer 3-way moneylines, elections, etc.)
// NegRiskAdapter uses a SIMPLIFIED 2-parameter redeemPositions that:
// 1. Redeems conditional tokens from CTF using WrappedCollateral as collateral
// 2. Automatically unwraps WCOL back to USDC
// 3. Returns USDC to the caller
// See: https://github.com/Polymarket/neg-risk-ctf-adapter/blob/main/docs/NegRiskAdapter.md
const NEG_RISK_ADAPTER_ABI = [
  {
    name: "redeemPositions",
    type: "function",
    inputs: [
      { name: "_conditionId", type: "bytes32" },
      { name: "_amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

// NegRisk Adapter address on Polygon
const NEG_RISK_ADAPTER_ADDRESS = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296" as const;

// Public client for read operations (balance queries)
const publicClient = createPublicClient({
  chain: polygon,
  transport: http("https://polygon-rpc.com"),
});

// Query CTF token balances for a specific position
async function queryCTFBalance(owner: Address, positionId: bigint): Promise<bigint> {
  try {
    const balance = await publicClient.readContract({
      address: CTF_ADDRESS,
      abi: CTF_ABI,
      functionName: "balanceOf",
      args: [owner, positionId],
    });
    return balance as bigint;
  } catch (error) {
    console.error(`Failed to query CTF balance for position ${positionId}:`, error);
    return 0n;
  }
}

// Optional props to pass session credentials - avoids duplicate credential derivation
export interface PolymarketClientProps {
  sessionCredentials?: ApiKeyCreds | null;
  sessionSafeAddress?: string | null;
}

export function usePolymarketClient(props?: PolymarketClientProps) {
  const { sessionCredentials, sessionSafeAddress } = props || {};
  const { eoaAddress, walletClient, ethersSigner, isReady, authenticated } = useWallet();
  const [isInitializing, setIsInitializing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRelayerLoading, setIsRelayerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<ClobClient | null>(null);
  const relayClientRef = useRef<RelayClient | null>(null);
  const credsRef = useRef<ApiKeyCreds | null>(null);
  const addressRef = useRef<string | null>(null);
  const safeAddressRef = useRef<string | null>(null);
  
  const { collectFee, isFeeCollectionEnabled } = useFeeCollection();

  const initializeClient = useCallback(async (): Promise<ClobClient | null> => {
    if (clientRef.current && credsRef.current) {
      console.log("[PolymarketClient] Using cached client");
      return clientRef.current;
    }

    if (!isReady || !authenticated || !eoaAddress || !ethersSigner || !walletClient) {
      setError("Wallet not connected");
      return null;
    }

    setIsInitializing(true);
    setError(null);

    try {
      // Use ethersSigner directly from context (already created in WalletProvider)
      const signer = ethersSigner;

      const address = await signer.getAddress();
      addressRef.current = address;
      console.log("[PolymarketClient] Connected wallet:", address);

      // STEP 1: Use session Safe address if provided, otherwise derive
      let safeAddress = sessionSafeAddress || safeAddressRef.current;
      
      // Always initialize RelayClient for fee collection and relay operations
      if (!relayClientRef.current) {
        const builderConfig = new BuilderConfig({
          remoteBuilderConfig: {
            url: `${window.location.origin}/api/polymarket/sign`,
          },
        });
        
        const relayClient = new RelayClient(
          RELAYER_HOST,
          CHAIN_ID,
          walletClient,
          builderConfig,
          RelayerTxType.SAFE,
        );
        
        relayClientRef.current = relayClient;
      }
      
      if (!safeAddress) {
        console.log("[PolymarketClient] Deriving Safe address...");
        // Derive the Safe address from the EOA using SDK's static contract config
        const config = getContractConfig(137); // Polygon chainId
        const safeFactory = config.SafeContracts.SafeFactory;
        safeAddress = deriveSafe(address, safeFactory);
        console.log("[PolymarketClient] Safe address:", safeAddress, "from SDK factory:", safeFactory);
      } else {
        console.log("[PolymarketClient] Using session Safe address:", safeAddress);
      }
      safeAddressRef.current = safeAddress;

      if (!safeAddress) {
        throw new Error("Failed to derive Safe address");
      }

      // STEP 2: Use session credentials if provided, otherwise derive
      let creds = sessionCredentials || credsRef.current;
      if (!creds || !creds.key || !creds.secret || !creds.passphrase) {
        console.log("[PolymarketClient] No session credentials, deriving fresh API credentials...");
        const tempClient = new ClobClient(
          CLOB_HOST,
          CHAIN_ID,
          signer
        );

        try {
          creds = await tempClient.createApiKey();
          console.log("[PolymarketClient] Successfully created new API credentials");
        } catch (createErr: any) {
          console.log("[PolymarketClient] Create failed, trying to derive existing...", createErr?.message);
          creds = await tempClient.deriveApiKey();
          console.log("[PolymarketClient] Successfully derived existing API credentials");
        }
      } else {
        console.log("[PolymarketClient] Using session credentials, key:", creds.key.substring(0, 8) + "...");
      }
      credsRef.current = creds;

      // STEP 4: Create authenticated ClobClient with Safe config + BuilderConfig
      // Per official privy-safe-builder-example:
      // - signatureType: 2 = Safe proxy wallet (gasless)
      // - funder = Safe address where USDC is deposited
      // - BuilderConfig = enables order attribution
      const clobBuilderConfig = new BuilderConfig({
        remoteBuilderConfig: {
          url: `${window.location.origin}/api/polymarket/sign`,
        },
      });
      
      const authenticatedClient = new ClobClient(
        CLOB_HOST,
        CHAIN_ID,
        signer,
        creds,
        2, // signatureType: 2 = Safe proxy wallet (gasless trading)
        safeAddress, // funder = Safe address where USDC is deposited
        undefined, // mandatory placeholder (7th param)
        false, // (8th param)
        clobBuilderConfig, // Builder order attribution (9th param)
      );

      clientRef.current = authenticatedClient;
      console.log("[PolymarketClient] Client initialized with Safe wallet:", safeAddress);

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
  }, [isReady, authenticated, eoaAddress, ethersSigner, walletClient, sessionCredentials, sessionSafeAddress]);

  const placeOrder = useCallback(
    async (params: OrderParams): Promise<OrderResult> => {
      setIsSubmitting(true);
      setError(null);

      try {
        // Get amount - either from new amount field or legacy price*size
        const amount = params.amount ?? (params.price && params.size ? params.price * params.size : 0);
        
        // TEMPORARILY DISABLED for testing signature flow without funds
        // Validate minimum order value using market's orderMinSize from Polymarket (in USDC)
        // Default to 5 if not specified (Polymarket's typical minimum)
        // const minOrderValueUSDC = params.orderMinSize ?? 5;
        // if (amount < minOrderValueUSDC) {
        //   const errorMsg = `Order value too small: $${amount.toFixed(2)}. Polymarket requires minimum $${minOrderValueUSDC} for this market.`;
        //   setError(errorMsg);
        //   return { success: false, error: errorMsg };
        // }
        console.log("[PolymarketClient] Minimum order check BYPASSED for testing");

        const client = await initializeClient();
        if (!client) {
          return {
            success: false,
            error: "Failed to initialize Polymarket client",
          };
        }

        console.log("[PolymarketClient] Placing FOK market order:", {
          tokenId: params.tokenId,
          amount,
          side: params.side,
        });

        // Use FOK (Fill-or-Kill) market order for instant execution
        // Either fills completely or is rejected - no partial fills, no resting orders
        const marketOrderArgs = {
          tokenID: params.tokenId,
          amount: amount,
          side: params.side === "BUY" ? Side.BUY : Side.SELL,
        };

        const options = {
          tickSize: params.tickSize || "0.01",
          negRisk: params.negRisk ?? false,
        };

        // Use createAndPostMarketOrder with FOK for instant fill-or-kill execution
        const result = await client.createAndPostMarketOrder(
          marketOrderArgs,
          options,
          OrderType.FOK,
        );

        console.log("[PolymarketClient] FOK order result:", JSON.stringify(result, null, 2));

        // Check if order was successful
        // FOK orders either fill completely or are rejected - no partial fills
        const isSuccess = result.success !== false && !result.errorMsg;
        const orderID = result.orderID || result.id;
        
        // For FOK orders, if success then it was filled, if not then it was rejected
        const isFilled = isSuccess;
        
        // Store order in our database for tracking
        try {
          await fetch("/api/polymarket/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order: {
                tokenID: params.tokenId,
                amount: amount,
                side: params.side,
                orderType: "FOK",
              },
              walletAddress: addressRef.current,
              polymarketOrderId: orderID,
              status: isFilled ? "matched" : "cancelled",
            }),
          });
        } catch (dbErr) {
          console.warn("[PolymarketClient] Failed to store order in DB:", dbErr);
        }

        if (!isSuccess) {
          // FOK order was rejected - not enough liquidity
          const errorMsg = result.errorMsg || "Order not filled - not enough liquidity. Try a smaller amount.";
          setError(errorMsg);
          return {
            success: true, // Request succeeded, just no fill
            error: errorMsg,
            status: "cancelled",
            filled: false,
            orderID,
          };
        }

        // Collect integrator fee after successful order (if enabled)
        // Fee is collected as a separate USDC transfer, does not affect the bet
        // Only collect fees on BUY orders where amount = USDC spent (accurate fee basis)
        // SELL orders would require fill price from order response for accurate calculation
        // Note: relayClientRef is populated during initializeClient
        console.log("[FeeCollection] Checking fee collection conditions:", {
          isFeeCollectionEnabled,
          hasRelayClient: !!relayClientRef.current,
          side: params.side,
          amount,
          orderStatus: result.status,
          isSuccess,
        });
        
        if (isFeeCollectionEnabled && relayClientRef.current && params.side === "BUY") {
          console.log("[FeeCollection] Conditions met - attempting fee collection for $" + amount);
          try {
            // BUY: amount is USDC spent, use directly as fee basis
            const feeResult = await collectFee(relayClientRef.current, amount);
            console.log("[FeeCollection] Result:", {
              success: feeResult.success,
              feeAmount: feeResult.feeAmount.toString(),
              txHash: feeResult.txHash,
            });
            if (feeResult.success && feeResult.feeAmount > 0n) {
              console.log("[PolymarketClient] Fee collected:", feeResult.feeAmount.toString());
            }
          } catch (feeErr) {
            // Fee collection failure should not fail the order
            console.warn("[PolymarketClient] Fee collection failed (order still succeeded):", feeErr);
          }
        } else {
          console.log("[FeeCollection] Skipped - conditions not met");
        }

        return {
          success: true,
          orderID: orderID,
          transactionsHashes: result.transactionsHashes,
          status: "matched",
          filled: true,
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
                amount: params.amount,
                side: params.side,
                orderType: "FOK",
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
    [initializeClient, isFeeCollectionEnabled, collectFee],
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

    if (!isReady || !authenticated || !ethersSigner) return null;

    try {
      const address = await ethersSigner.getAddress();
      addressRef.current = address;
      return address;
    } catch {
      return null;
    }
  }, [isReady, authenticated, ethersSigner]);

  const initializeRelayClient =
    useCallback(async (): Promise<RelayClient | null> => {
      if (relayClientRef.current) {
        console.log("[PolymarketClient] Using cached relay client");
        return relayClientRef.current;
      }

      if (!isReady || !authenticated || !walletClient) {
        setError("Wallet not connected");
        return null;
      }

      setIsRelayerLoading(true);
      setError(null);

      try {
        // Use walletClient directly from context
        const [address] = await walletClient.getAddresses();
        addressRef.current = address;

        // Configure Builder with remote signing via our server endpoint
        const builderConfig = new BuilderConfig({
          remoteBuilderConfig: {
            url: `${window.location.origin}/api/polymarket/sign`,
          },
        });

        const relayClient = new RelayClient(
          RELAYER_HOST,
          CHAIN_ID,
          walletClient,
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
    }, [isReady, authenticated, walletClient]);

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

  // Position data from Polymarket API - used for redemption
  interface RedeemablePosition {
    conditionId?: string; // Optional to match PolymarketPosition type, validated inside function
    tokenId?: string;
    outcomeLabel?: string; // "Yes" or "No" - from Polymarket API
    negRisk?: boolean;
  }

  // Batch redeem multiple positions in a single transaction (one signature for all)
  // Supports both standard CTF markets and NegRisk markets (winner-take-all like soccer 3-way)
  const batchRedeemPositions = useCallback(
    async (
      positions: RedeemablePosition[], // Pass position objects directly - no transformation needed
      indexSets: number[] = [1, 2],
    ): Promise<TransactionResult> => {
      setIsRelayerLoading(true);
      setError(null);

      try {
        if (!positions || positions.length === 0) {
          return { success: false, error: "No positions to redeem" };
        }

        // Validate all conditionIds
        for (const pos of positions) {
          if (!pos.conditionId || !/^0x[a-fA-F0-9]{64}$/.test(pos.conditionId)) {
            return { success: false, error: `Invalid condition ID format: ${pos.conditionId}` };
          }
        }

        const relayClient = await initializeRelayClient();
        if (!relayClient) {
          return {
            success: false,
            error: "Failed to initialize RelayClient. Please ensure your wallet is connected.",
          };
        }

        // Separate CTF and NegRisk positions using the negRisk flag from API
        const ctfPositions = positions.filter(p => !p.negRisk);
        const negRiskPositions = positions.filter(p => p.negRisk);

        console.log(
          "[PolymarketClient] Batch redeeming positions from Safe wallet...",
          { 
            total: positions.length, 
            ctfCount: ctfPositions.length, 
            negRiskCount: negRiskPositions.length 
          },
        );

        const parentCollectionId =
          "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

        // Build transactions array
        const redeemTxs: { to: string; value: string; data: string }[] = [];

        // Add CTF redeem transactions (standard markets)
        for (const pos of ctfPositions) {
          const redeemData = encodeFunctionData({
            abi: CTF_ABI,
            functionName: "redeemPositions",
            args: [
              USDC_ADDRESS,
              parentCollectionId,
              pos.conditionId as `0x${string}`,
              indexSets.map(BigInt),
            ],
          });

          redeemTxs.push({
            to: CTF_ADDRESS,
            value: "0",
            data: redeemData,
          });
        }

        // Add NegRisk redeem transactions (winner-take-all markets like soccer 3-way moneylines)
        // NegRisk positions are backed by WrappedCollateral (WCOL), NOT USDC
        // NegRiskAdapter.redeemPositions(conditionId, amounts[]) handles:
        // 1. Redeeming conditional tokens via CTF with WCOL as collateral
        // 2. Automatically unwrapping WCOL → USDC
        // 3. Returning USDC to the caller
        
        // Get Safe address - derive from EOA if not already cached
        let safeAddress = safeAddressRef.current;
        if (!safeAddress && eoaAddress) {
          const config = await getContractConfig(CHAIN_ID);
          const safeFactory = config.SafeContracts.SafeFactory;
          safeAddress = deriveSafe(eoaAddress, safeFactory);
          safeAddressRef.current = safeAddress;
          console.log("[NegRisk] Derived Safe address for balance query:", safeAddress);
        }
        if (negRiskPositions.length > 0 && !safeAddress) {
          return { success: false, error: "Safe wallet address not available for balance query" };
        }
        
        for (const pos of negRiskPositions) {
          // Skip positions without required fields
          if (!pos.conditionId || !pos.tokenId) {
            console.log(`[NegRisk] Skipping position - missing conditionId or tokenId`);
            continue;
          }
          
          // Query actual CTF token balance using the real tokenId from Polymarket API
          const positionId = BigInt(pos.tokenId);
          const balance = await queryCTFBalance(safeAddress as Address, positionId);
          
          console.log(`[NegRisk] Position: conditionId=${pos.conditionId.slice(0, 10)}...`);
          console.log(`  Token ID: ${pos.tokenId.slice(0, 20)}...`);
          console.log(`  Outcome: ${pos.outcomeLabel} (from API)`);
          console.log(`  Balance: ${balance.toString()} (${Number(balance) / 1e6} USDC)`);
          
          // Skip if no balance to redeem
          if (balance === 0n) {
            console.log(`[NegRisk] Skipping - no tokens to redeem`);
            continue;
          }
          
          // Use outcomeLabel directly from Polymarket API - no computation needed!
          // amounts = [yesAmount, noAmount]
          const isYesPosition = pos.outcomeLabel?.toLowerCase() === 'yes';
          const amounts = isYesPosition 
            ? [balance, 0n]  // YES position: [yesAmount, 0]
            : [0n, balance]; // NO position: [0, noAmount]
          
          console.log(`[NegRisk] Redeeming via NegRiskAdapter amounts=[${amounts[0].toString()}, ${amounts[1].toString()}]`);
          
          const redeemData = encodeFunctionData({
            abi: NEG_RISK_ADAPTER_ABI,
            functionName: "redeemPositions",
            args: [
              pos.conditionId as `0x${string}`,
              amounts,
            ],
          });

          redeemTxs.push({
            to: NEG_RISK_ADAPTER_ADDRESS,
            value: "0",
            data: redeemData,
          });
        }

        if (redeemTxs.length === 0) {
          return { success: false, error: "No transactions to execute" };
        }

        // Execute ALL transactions in one batch - requires only ONE signature!
        const response = await relayClient.execute(
          redeemTxs,
          `Redeem ${positions.length} winning positions`,
        );
        const result = await response.wait();

        console.log("[PolymarketClient] Batch redeem result:", result);
        return { success: true, txHash: result?.transactionHash };
      } catch (err) {
        console.error("[PolymarketClient] Batch redeem error:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Batch redeem failed";
        if (
          errorMessage.includes("payout is zero") ||
          errorMessage.includes("nothing to redeem")
        ) {
          return {
            success: false,
            error: "No winning positions to redeem",
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
    batchRedeemPositions,
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
