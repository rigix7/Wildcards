import { ClobClient, Side, OrderType } from "@polymarket/clob-client";
import { RelayClient, RelayerTxType } from "@polymarket/builder-relayer-client";
import { getContractConfig } from "@polymarket/builder-relayer-client/dist/config";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import {
  encodeFunctionData,
  parseUnits,
  getCreate2Address,
  keccak256,
  encodeAbiParameters,
  createPublicClient,
  type Address,
} from "viem";
import { polygon } from "viem/chains";
import { polygonTransport } from "@/constants/polymarket";

import type {
  SDKConfig,
  WalletAdapter,
  PlaceOrderParams,
  OrderResult,
  TransactionResult,
  RedeemablePosition,
  Position,
  OrderBookData,
  OrderBookLevel,
  FeeCollectionResult,
  SafeInfo,
} from "./types";

import {
  POLYGON_CHAIN_ID,
  CLOB_HOST,
  RELAYER_HOST,
  USDC_ADDRESS,
  USDC_DECIMALS,
  CTF_ADDRESS,
  CTF_EXCHANGE_ADDRESS,
  NEG_RISK_CTF_EXCHANGE_ADDRESS,
  NEG_RISK_ADAPTER_ADDRESS,
  SAFE_INIT_CODE_HASH,
} from "./constants";

import { ERC20_ABI, CTF_ABI, NEG_RISK_ADAPTER_ABI } from "./abis";

interface ApiKeyCreds {
  key: string;
  secret: string;
  passphrase: string;
}

function deriveSafe(address: string, safeFactory: string): string {
  return getCreate2Address({
    bytecodeHash: SAFE_INIT_CODE_HASH,
    from: safeFactory as Address,
    salt: keccak256(
      encodeAbiParameters(
        [{ name: "address", type: "address" }],
        [address as Address]
      )
    ),
  });
}

const publicClient = createPublicClient({
  chain: polygon,
  transport: polygonTransport,
});

async function queryCTFBalance(
  owner: Address,
  positionId: bigint
): Promise<bigint> {
  try {
    const balance = await (publicClient as any).readContract({
      address: CTF_ADDRESS,
      abi: CTF_ABI,
      functionName: "balanceOf",
      args: [owner, positionId],
    });
    return balance as bigint;
  } catch (error) {
    console.error(
      `[SDK] Failed to query CTF balance for position ${positionId}:`,
      error
    );
    return BigInt(0);
  }
}

export class PolymarketSDK {
  private config: SDKConfig;
  private wallet: WalletAdapter | null = null;
  private clobClient: ClobClient | null = null;
  private relayClient: RelayClient | null = null;
  private apiCreds: ApiKeyCreds | null = null;
  private eoaAddress: string | null = null;
  private safeAddress: string | null = null;
  private isInitialized = false;

  constructor(config: SDKConfig) {
    this.config = {
      chainId: POLYGON_CHAIN_ID,
      feeBps: 0,
      ...config,
    };
  }

  async initialize(wallet: WalletAdapter): Promise<void> {
    this.wallet = wallet;
    this.eoaAddress = await wallet.getAddress();
    console.log("[SDK] Initializing with EOA:", this.eoaAddress);

    const signer = wallet.getEthersSigner();
    const viemClient = wallet.getViemWalletClient();

    const config = getContractConfig(this.config.chainId || POLYGON_CHAIN_ID);
    const safeFactory = config.SafeContracts.SafeFactory;
    this.safeAddress = deriveSafe(this.eoaAddress, safeFactory);
    console.log("[SDK] Derived Safe address:", this.safeAddress);

    const builderConfig = new BuilderConfig({
      remoteBuilderConfig: {
        url: this.config.signingEndpoint,
      },
    });

    this.relayClient = new RelayClient(
      RELAYER_HOST,
      this.config.chainId || POLYGON_CHAIN_ID,
      viemClient,
      builderConfig,
      RelayerTxType.SAFE
    );

    const tempClient = new ClobClient(
      CLOB_HOST,
      this.config.chainId || POLYGON_CHAIN_ID,
      signer
    );

    try {
      this.apiCreds = await tempClient.createApiKey();
      console.log("[SDK] Created new API credentials");
    } catch (err) {
      console.log("[SDK] Create failed, deriving existing credentials...");
      this.apiCreds = await tempClient.deriveApiKey();
    }

    const clobBuilderConfig = new BuilderConfig({
      remoteBuilderConfig: {
        url: this.config.signingEndpoint,
      },
    });

    this.clobClient = new ClobClient(
      CLOB_HOST,
      this.config.chainId || POLYGON_CHAIN_ID,
      signer,
      this.apiCreds,
      2,
      this.safeAddress,
      undefined,
      false,
      clobBuilderConfig
    );

    this.isInitialized = true;
    console.log("[SDK] Initialization complete");
  }

  private ensureInitialized(): void {
    if (!this.isInitialized || !this.clobClient || !this.relayClient) {
      throw new Error("SDK not initialized. Call initialize() first.");
    }
  }

  getSafeAddress(): string | null {
    return this.safeAddress;
  }

  getEOAAddress(): string | null {
    return this.eoaAddress;
  }

  async deploySafe(): Promise<TransactionResult> {
    this.ensureInitialized();

    try {
      console.log("[SDK] Deploying Safe wallet...");
      const response = await this.relayClient!.deploy();
      const result = await response.wait();

      if (result?.proxyAddress) {
        this.safeAddress = result.proxyAddress;
        console.log("[SDK] Safe deployed:", result.proxyAddress);
        return { success: true, proxyAddress: result.proxyAddress };
      }

      return { success: false, error: "Safe deployment failed" };
    } catch (err) {
      console.error("[SDK] Safe deployment error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Deploy failed",
      };
    }
  }

  async approveUSDC(): Promise<TransactionResult> {
    this.ensureInitialized();

    try {
      console.log("[SDK] Approving USDC for CTF Exchange...");

      const maxApproval = BigInt(
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
      );
      const approvalData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CTF_EXCHANGE_ADDRESS as Address, maxApproval],
      });

      const approvalTx = {
        to: USDC_ADDRESS,
        value: "0",
        data: approvalData,
      };

      const negRiskApprovalData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [NEG_RISK_CTF_EXCHANGE_ADDRESS as Address, maxApproval],
      });

      const negRiskApprovalTx = {
        to: USDC_ADDRESS,
        value: "0",
        data: negRiskApprovalData,
      };

      const response = await this.relayClient!.execute(
        [approvalTx, negRiskApprovalTx],
        "Approve USDC for trading"
      );
      const result = await response.wait();

      console.log("[SDK] USDC approval result:", result);
      return { success: true, txHash: result?.transactionHash };
    } catch (err) {
      console.error("[SDK] USDC approval error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Approval failed",
      };
    }
  }

  async placeOrder(params: PlaceOrderParams): Promise<OrderResult> {
    this.ensureInitialized();

    try {
      console.log("[SDK] Placing FOK market order:", params);

      const marketOrderArgs = {
        tokenID: params.tokenId,
        amount: params.amount,
        side: params.side === "BUY" ? Side.BUY : Side.SELL,
      };

      const options = {
        tickSize: params.tickSize || "0.01",
        negRisk: params.negRisk ?? false,
      };

      const result = await this.clobClient!.createAndPostMarketOrder(
        marketOrderArgs,
        options,
        OrderType.FOK
      );

      console.log("[SDK] Order result:", JSON.stringify(result, null, 2));

      const isSuccess = result.success !== false && !result.errorMsg;
      const orderID = result.orderID || result.id;
      const isFilled = isSuccess;

      if (!isSuccess) {
        return {
          success: false,
          error:
            result.errorMsg ||
            "Order not filled - not enough liquidity",
          status: "cancelled",
          filled: false,
          orderID,
        };
      }

      let feeCollected: bigint | undefined;
      if (
        this.isFeeCollectionEnabled() &&
        params.side === "BUY"
      ) {
        try {
          const feeResult = await this.collectFee(params.amount);
          if (feeResult.success && feeResult.feeAmount > BigInt(0)) {
            feeCollected = feeResult.feeAmount;
            console.log("[SDK] Fee collected:", feeCollected.toString());
          }
        } catch (feeErr) {
          console.warn("[SDK] Fee collection failed (order succeeded):", feeErr);
        }
      }

      return {
        success: true,
        orderID,
        transactionsHashes: result.transactionsHashes,
        status: "matched",
        filled: true,
        feeCollected,
      };
    } catch (err) {
      console.error("[SDK] Order error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Order submission failed",
      };
    }
  }

  async getOrderBook(tokenId: string): Promise<OrderBookData | null> {
    try {
      const readOnlyClient = new ClobClient(
        CLOB_HOST,
        this.config.chainId || POLYGON_CHAIN_ID
      );

      const book = await readOnlyClient.getOrderBook(tokenId);
      if (!book) return null;

      const bids: OrderBookLevel[] = (book.bids || []).map(
        (b: { price: string; size: string }) => ({
          price: parseFloat(b.price),
          size: parseFloat(b.size),
        })
      );

      const asks: OrderBookLevel[] = (book.asks || []).map(
        (a: { price: string; size: string }) => ({
          price: parseFloat(a.price),
          size: parseFloat(a.size),
        })
      );

      bids.sort((a, b) => b.price - a.price);
      asks.sort((a, b) => a.price - b.price);

      const bestBid = bids.length > 0 ? bids[0].price : 0;
      const bestAsk = asks.length > 0 ? asks[0].price : 1;
      const spread = bestAsk - bestBid;
      const midPrice = (bestAsk + bestBid) / 2;
      const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

      const bidDepth = bids.length > 0 ? bids[0].size * bids[0].price : 0;
      const askDepth = asks.length > 0 ? asks[0].size * asks[0].price : 0;

      const totalBidLiquidity = bids.reduce(
        (sum, b) => sum + b.size * b.price,
        0
      );
      const totalAskLiquidity = asks.reduce(
        (sum, a) => sum + a.size * a.price,
        0
      );

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
        isLowLiquidity: askDepth < 100,
        isWideSpread: spreadPercent > 5,
      };
    } catch (err) {
      console.error("[SDK] Failed to fetch order book:", err);
      return null;
    }
  }

  async withdrawUSDC(
    amount: number,
    toAddress: string
  ): Promise<TransactionResult> {
    this.ensureInitialized();

    try {
      if (!amount || amount <= 0) {
        return { success: false, error: "Invalid withdrawal amount" };
      }
      if (!toAddress || !/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
        return { success: false, error: "Invalid destination address" };
      }

      console.log("[SDK] Withdrawing USDC:", { amount, toAddress });

      const amountWei = parseUnits(amount.toString(), USDC_DECIMALS);
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

      const response = await this.relayClient!.execute(
        [transferTx],
        "Withdraw USDC"
      );
      const result = await response.wait();

      return { success: true, txHash: result?.transactionHash };
    } catch (err) {
      console.error("[SDK] Withdrawal error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Withdrawal failed",
      };
    }
  }

  async batchRedeemPositions(
    positions: RedeemablePosition[],
    indexSets: number[] = [1, 2]
  ): Promise<TransactionResult> {
    this.ensureInitialized();

    try {
      if (!positions || positions.length === 0) {
        return { success: false, error: "No positions to redeem" };
      }

      for (const pos of positions) {
        if (!pos.conditionId || !/^0x[a-fA-F0-9]{64}$/.test(pos.conditionId)) {
          return {
            success: false,
            error: `Invalid condition ID: ${pos.conditionId}`,
          };
        }
      }

      const ctfPositions = positions.filter((p) => !p.negRisk);
      const negRiskPositions = positions.filter((p) => p.negRisk);

      console.log("[SDK] Batch redeeming positions:", {
        total: positions.length,
        ctfCount: ctfPositions.length,
        negRiskCount: negRiskPositions.length,
      });

      const parentCollectionId =
        "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

      const redeemTxs: { to: string; value: string; data: string }[] = [];

      for (const pos of ctfPositions) {
        const redeemData = encodeFunctionData({
          abi: CTF_ABI,
          functionName: "redeemPositions",
          args: [
            USDC_ADDRESS as Address,
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

      for (const pos of negRiskPositions) {
        if (!pos.conditionId || !pos.tokenId) {
          console.log("[SDK] Skipping position - missing required fields");
          continue;
        }

        const positionId = BigInt(pos.tokenId);
        const balance = await queryCTFBalance(
          this.safeAddress as Address,
          positionId
        );

        console.log(`[SDK] NegRisk position:`, {
          conditionId: pos.conditionId.slice(0, 10) + "...",
          outcomeLabel: pos.outcomeLabel,
          balance: balance.toString(),
        });

        if (balance === BigInt(0)) {
          console.log("[SDK] Skipping - no tokens to redeem");
          continue;
        }

        const isYesPosition = pos.outcomeLabel?.toLowerCase() === "yes";
        const amounts = isYesPosition ? [balance, BigInt(0)] : [BigInt(0), balance];

        const redeemData = encodeFunctionData({
          abi: NEG_RISK_ADAPTER_ABI,
          functionName: "redeemPositions",
          args: [pos.conditionId as `0x${string}`, amounts],
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

      const response = await this.relayClient!.execute(
        redeemTxs,
        `Redeem ${positions.length} winning positions`
      );
      const result = await response.wait();

      console.log("[SDK] Batch redeem result:", result);
      return { success: true, txHash: result?.transactionHash };
    } catch (err) {
      console.error("[SDK] Batch redeem error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Batch redeem failed",
      };
    }
  }

  async getPositions(): Promise<Position[]> {
    if (!this.safeAddress) {
      console.warn("[SDK] Safe address not available for positions query");
      return [];
    }

    try {
      const response = await fetch(
        `https://data-api.polymarket.com/positions?user=${this.safeAddress}`
      );

      if (!response.ok) {
        console.error("[SDK] Failed to fetch positions:", response.status);
        return [];
      }

      const data = await response.json();
      
      return (data || []).map((p: any) => ({
        conditionId: p.conditionId,
        tokenId: p.tokenId,
        size: parseFloat(p.size || "0"),
        avgPrice: parseFloat(p.avgPrice || "0"),
        side: p.side,
        outcomeLabel: p.outcome,
        negRisk: p.negRisk ?? false,
        marketSlug: p.slug,
        question: p.question,
      }));
    } catch (err) {
      console.error("[SDK] Error fetching positions:", err);
      return [];
    }
  }

  async redeemWinnings(positions: RedeemablePosition[]): Promise<TransactionResult> {
    return this.batchRedeemPositions(positions);
  }

  isFeeCollectionEnabled(): boolean {
    return !!(
      this.config.feeAddress &&
      this.config.feeBps &&
      this.config.feeBps > 0
    );
  }

  calculateFeeAmount(orderValueUsdc: number): bigint {
    if (!this.isFeeCollectionEnabled() || orderValueUsdc <= 0) {
      return BigInt(0);
    }

    const feeDecimal =
      orderValueUsdc * ((this.config.feeBps || 0) / 10000);
    return BigInt(Math.floor(feeDecimal * Math.pow(10, USDC_DECIMALS)));
  }

  async collectFee(orderValueUsdc: number): Promise<FeeCollectionResult> {
    const zeroBigInt = BigInt(0);
    
    if (!this.isFeeCollectionEnabled()) {
      return { success: true, feeAmount: zeroBigInt };
    }

    const feeAmount = this.calculateFeeAmount(orderValueUsdc);
    if (feeAmount <= zeroBigInt) {
      return { success: true, feeAmount: zeroBigInt };
    }

    try {
      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [this.config.feeAddress as Address, feeAmount],
      });

      const feeTransferTx = {
        to: USDC_ADDRESS,
        value: "0",
        data: transferData,
      };

      const feeUsdcAmount = Number(feeAmount) / Math.pow(10, USDC_DECIMALS);
      const response = await this.relayClient!.execute(
        [feeTransferTx],
        `Collect fee: ${feeUsdcAmount.toFixed(2)} USDC`
      );
      const result = await response.wait();

      return {
        success: true,
        feeAmount,
        txHash: result?.transactionHash,
      };
    } catch (err) {
      console.error("[SDK] Fee collection error:", err);
      return { success: false, feeAmount };
    }
  }

  reset(): void {
    this.clobClient = null;
    this.relayClient = null;
    this.apiCreds = null;
    this.eoaAddress = null;
    this.safeAddress = null;
    this.isInitialized = false;
    console.log("[SDK] Reset complete");
  }
}
