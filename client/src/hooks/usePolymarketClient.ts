import { useCallback, useState, useRef, useMemo } from "react";
import { ClobClient, Side, OrderType } from "@polymarket/clob-client";
import { RelayClient, RelayerTxType } from "@polymarket/builder-relayer-client";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { providers } from "ethers";
import { createWalletClient, custom, encodeFunctionData, parseUnits, type Address } from "viem";
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
}

export interface OrderResult {
  success: boolean;
  orderID?: string;
  transactionsHashes?: string[];
  error?: string;
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
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  },
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  }
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
      { name: "indexSets", type: "uint256[]" }
    ],
    outputs: []
  }
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
      const ethersProvider = new providers.Web3Provider(privyProvider as providers.ExternalProvider);
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
        address // funder address
      );

      clientRef.current = authenticatedClient;
      console.log("[PolymarketClient] Client initialized successfully");
      
      return authenticatedClient;
    } catch (err) {
      console.error("[PolymarketClient] Initialization error:", err);
      setError(err instanceof Error ? err.message : "Failed to initialize client");
      return null;
    } finally {
      setIsInitializing(false);
    }
  }, [isReady, authenticated, eoaAddress, getProvider]);

  const placeOrder = useCallback(async (params: OrderParams): Promise<OrderResult> => {
    setIsSubmitting(true);
    setError(null);

    try {
      const client = await initializeClient();
      if (!client) {
        return { success: false, error: "Failed to initialize Polymarket client" };
      }

      console.log("[PolymarketClient] Placing order:", params);

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

      const result = await client.createAndPostOrder(orderArgs, options, OrderType.GTC);
      
      console.log("[PolymarketClient] Order result:", result);

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
            polymarketOrderId: result.orderID || result.id,
            status: result.success !== false ? "submitted" : "failed",
          }),
        });
      } catch (dbErr) {
        console.warn("[PolymarketClient] Failed to store order in DB:", dbErr);
      }

      if (result.success === false || result.errorMsg) {
        return {
          success: false,
          error: result.errorMsg || "Order rejected by Polymarket",
        };
      }

      return {
        success: true,
        orderID: result.orderID || result.id,
        transactionsHashes: result.transactionsHashes,
      };
    } catch (err) {
      console.error("[PolymarketClient] Order error:", err);
      const errorMsg = err instanceof Error ? err.message : "Order submission failed";
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsSubmitting(false);
    }
  }, [initializeClient]);

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

  const cancelOrder = useCallback(async (orderId: string): Promise<boolean> => {
    try {
      const client = await initializeClient();
      if (!client) return false;
      
      await client.cancelOrder({ orderID: orderId });
      return true;
    } catch (err) {
      console.error("[PolymarketClient] Failed to cancel order:", err);
      return false;
    }
  }, [initializeClient]);

  const getWalletAddress = useCallback(async (): Promise<string | null> => {
    if (addressRef.current) return addressRef.current;
    
    if (!isReady || !authenticated) return null;
    
    try {
      const privyProvider = await getProvider();
      if (!privyProvider) return null;
      const ethersProvider = new providers.Web3Provider(privyProvider as providers.ExternalProvider);
      const signer = ethersProvider.getSigner();
      const address = await signer.getAddress();
      addressRef.current = address;
      return address;
    } catch {
      return null;
    }
  }, [isReady, authenticated, getProvider]);

  const initializeRelayClient = useCallback(async (): Promise<RelayClient | null> => {
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
        }
      });
      
      const relayClient = new RelayClient(
        RELAYER_HOST,
        CHAIN_ID,
        viemWallet,
        builderConfig,
        RelayerTxType.SAFE
      );
      
      relayClientRef.current = relayClient;
      console.log("[PolymarketClient] RelayClient initialized");
      
      return relayClient;
    } catch (err) {
      console.error("[PolymarketClient] RelayClient initialization error:", err);
      setError(err instanceof Error ? err.message : "Failed to initialize RelayClient");
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
      return { success: false, error: err instanceof Error ? err.message : "Deploy failed" };
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
        args: [CTF_EXCHANGE, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")]
      });

      const approvalTx = {
        to: USDC_ADDRESS,
        value: "0",
        data: approvalData,
      };

      const response = await relayClient.execute([approvalTx], "Approve USDC for trading");
      const result = await response.wait();
      
      console.log("[PolymarketClient] USDC approval result:", result);
      return { success: true, txHash: result?.transactionHash };
    } catch (err) {
      console.error("[PolymarketClient] USDC approval error:", err);
      return { success: false, error: err instanceof Error ? err.message : "Approval failed" };
    } finally {
      setIsRelayerLoading(false);
    }
  }, [initializeRelayClient]);

  const withdrawUSDC = useCallback(async (amount: number, toAddress: string): Promise<TransactionResult> => {
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
        return { success: false, error: "Failed to initialize RelayClient. Please ensure your wallet is connected." };
      }

      console.log("[PolymarketClient] Withdrawing USDC from Safe wallet...", { amount, toAddress });
      
      // USDC has 6 decimals on Polygon
      const amountWei = parseUnits(amount.toString(), 6);
      
      // Encode ERC20 transfer - RelayClient will execute this from the user's Safe wallet
      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [toAddress as Address, amountWei]
      });

      const transferTx = {
        to: USDC_ADDRESS,
        value: "0",
        data: transferData,
      };

      // RelayClient.execute() submits the transaction from the user's Safe wallet
      const response = await relayClient.execute([transferTx], "Withdraw USDC");
      const result = await response.wait();
      
      console.log("[PolymarketClient] Withdrawal result:", result);
      return { success: true, txHash: result?.transactionHash };
    } catch (err) {
      console.error("[PolymarketClient] Withdrawal error:", err);
      const errorMessage = err instanceof Error ? err.message : "Withdrawal failed";
      // Provide more helpful error messages
      if (errorMessage.includes("insufficient funds")) {
        return { success: false, error: "Insufficient USDC balance in Safe wallet" };
      }
      if (errorMessage.includes("safe not deployed")) {
        return { success: false, error: "Safe wallet not deployed. Please deploy your Safe first." };
      }
      return { success: false, error: errorMessage };
    } finally {
      setIsRelayerLoading(false);
    }
  }, [initializeRelayClient]);

  const redeemPositions = useCallback(async (
    conditionId: string,
    indexSets: number[] = [1, 2]
  ): Promise<TransactionResult> => {
    setIsRelayerLoading(true);
    setError(null);

    try {
      // Validate conditionId format (should be 0x-prefixed 32-byte hex)
      if (!conditionId || !/^0x[a-fA-F0-9]{64}$/.test(conditionId)) {
        return { success: false, error: "Invalid condition ID format" };
      }
      
      if (!indexSets || indexSets.length === 0) {
        return { success: false, error: "No index sets provided for redemption" };
      }

      const relayClient = await initializeRelayClient();
      if (!relayClient) {
        return { success: false, error: "Failed to initialize RelayClient. Please ensure your wallet is connected." };
      }

      console.log("[PolymarketClient] Redeeming positions from Safe wallet...", { conditionId, indexSets });
      
      // parentCollectionId = 0x0 for standard binary markets (top-level positions)
      // For nested markets, this would be non-zero
      const parentCollectionId = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
      
      // Encode CTF redeemPositions call
      // This redeems conditional tokens back to USDC after market resolution
      const redeemData = encodeFunctionData({
        abi: CTF_ABI,
        functionName: "redeemPositions",
        args: [
          USDC_ADDRESS,
          parentCollectionId,
          conditionId as `0x${string}`,
          indexSets.map(BigInt)
        ]
      });

      const redeemTx = {
        to: CTF_ADDRESS,
        value: "0",
        data: redeemData,
      };

      // RelayClient.execute() submits the transaction from the user's Safe wallet
      const response = await relayClient.execute([redeemTx], "Redeem winning positions");
      const result = await response.wait();
      
      console.log("[PolymarketClient] Redeem result:", result);
      return { success: true, txHash: result?.transactionHash };
    } catch (err) {
      console.error("[PolymarketClient] Redeem error:", err);
      const errorMessage = err instanceof Error ? err.message : "Redeem failed";
      // Provide more helpful error messages
      if (errorMessage.includes("payout is zero") || errorMessage.includes("nothing to redeem")) {
        return { success: false, error: "No winning positions to redeem for this market" };
      }
      if (errorMessage.includes("condition not resolved")) {
        return { success: false, error: "Market has not been resolved yet" };
      }
      if (errorMessage.includes("safe not deployed")) {
        return { success: false, error: "Safe wallet not deployed. Please deploy your Safe first." };
      }
      return { success: false, error: errorMessage };
    } finally {
      setIsRelayerLoading(false);
    }
  }, [initializeRelayClient]);

  const resetClient = useCallback(() => {
    clientRef.current = null;
    relayClientRef.current = null;
    credsRef.current = null;
    addressRef.current = null;
    safeAddressRef.current = null;
    setError(null);
  }, []);

  return {
    placeOrder,
    getOpenOrders,
    cancelOrder,
    getWalletAddress,
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
