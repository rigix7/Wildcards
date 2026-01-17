import { createPublicClient, http, formatUnits } from "viem";
import { polygon } from "viem/chains";

const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;

const USDC_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(),
});

export async function getUSDCBalance(address: string): Promise<number> {
  try {
    if (!address || !address.startsWith("0x")) {
      return 0;
    }

    const balance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    });

    return parseFloat(formatUnits(balance, 6));
  } catch (error) {
    console.error("Error fetching USDC balance:", error);
    return 0;
  }
}

export { publicClient, USDC_ADDRESS };
