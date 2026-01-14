import { useState, useCallback, useMemo } from "react";
import {
  getCreate2Address,
  keccak256,
  encodeAbiParameters,
  encodeFunctionData,
  parseAbi,
  concat,
  pad,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { useWallet } from "@/providers/WalletContext";
import { getUSDCBalance } from "@/lib/polygon";

const LEGACY_SAFE_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67" as Address;
const SAFE_INIT_CODE_HASH = "0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf" as `0x${string}`;

const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as Address;
const SAFE_SINGLETON = "0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552" as Address;

const SAFE_FACTORY_ABI = parseAbi([
  "function createProxyWithNonce(address _singleton, bytes memory initializer, uint256 saltNonce) external returns (address proxy)",
]);

const SAFE_SETUP_ABI = parseAbi([
  "function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver) external",
]);

const SAFE_EXEC_ABI = parseAbi([
  "function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes memory signatures) external payable returns (bool success)",
  "function nonce() external view returns (uint256)",
  "function getTransactionHash(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) external view returns (bytes32)",
]);

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
]);

function deriveLegacySafeAddress(eoaAddress: string): string {
  return getCreate2Address({
    bytecodeHash: SAFE_INIT_CODE_HASH,
    from: LEGACY_SAFE_FACTORY,
    salt: keccak256(encodeAbiParameters([{ name: 'address', type: 'address' }], [eoaAddress as Address])),
  });
}

export interface LegacyRecoveryState {
  legacySafeAddress: string | undefined;
  legacyBalance: number;
  isDeployed: boolean;
  isChecking: boolean;
  isDeploying: boolean;
  isTransferring: boolean;
  error: string | null;
}

export default function useLegacySafeRecovery(eoaAddress?: string, newSafeAddress?: string) {
  const { publicClient, walletClient } = useWallet();
  const [state, setState] = useState<LegacyRecoveryState>({
    legacySafeAddress: undefined,
    legacyBalance: 0,
    isDeployed: false,
    isChecking: false,
    isDeploying: false,
    isTransferring: false,
    error: null,
  });

  const legacySafeAddress = useMemo(() => {
    if (!eoaAddress) return undefined;
    try {
      return deriveLegacySafeAddress(eoaAddress);
    } catch {
      return undefined;
    }
  }, [eoaAddress]);

  const checkLegacySafe = useCallback(async () => {
    if (!legacySafeAddress || !publicClient) return;

    setState(prev => ({ ...prev, isChecking: true, error: null }));

    try {
      const code = await publicClient.getCode({ address: legacySafeAddress as Address });
      const isDeployed = !!code && code !== "0x";
      
      const balance = await getUSDCBalance(legacySafeAddress);

      setState(prev => ({
        ...prev,
        legacySafeAddress,
        legacyBalance: balance,
        isDeployed,
        isChecking: false,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        isChecking: false,
        error: err instanceof Error ? err.message : "Failed to check legacy Safe",
      }));
    }
  }, [legacySafeAddress, publicClient]);

  const deployLegacySafe = useCallback(async () => {
    if (!eoaAddress || !walletClient || !publicClient) {
      throw new Error("Wallet not connected");
    }

    setState(prev => ({ ...prev, isDeploying: true, error: null }));

    try {
      const fallbackHandler = "0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4" as Address;
      
      const initializer = encodeFunctionData({
        abi: SAFE_SETUP_ABI,
        functionName: "setup",
        args: [
          [eoaAddress as Address],
          BigInt(1),
          "0x0000000000000000000000000000000000000000" as Address,
          "0x" as `0x${string}`,
          fallbackHandler,
          "0x0000000000000000000000000000000000000000" as Address,
          BigInt(0),
          "0x0000000000000000000000000000000000000000" as Address,
        ],
      });

      const saltNonce = BigInt(eoaAddress);

      const hash = await walletClient.writeContract({
        address: LEGACY_SAFE_FACTORY,
        abi: SAFE_FACTORY_ABI,
        functionName: "createProxyWithNonce",
        args: [SAFE_SINGLETON, initializer, saltNonce],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        setState(prev => ({ ...prev, isDeployed: true, isDeploying: false }));
        return true;
      } else {
        throw new Error("Transaction failed");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to deploy legacy Safe";
      setState(prev => ({ ...prev, isDeploying: false, error: message }));
      throw err;
    }
  }, [eoaAddress, walletClient, publicClient]);

  const transferToNewSafe = useCallback(async (amount: number) => {
    if (!legacySafeAddress || !newSafeAddress || !walletClient || !publicClient) {
      throw new Error("Missing addresses or wallet");
    }

    setState(prev => ({ ...prev, isTransferring: true, error: null }));

    try {
      const amountInUnits = BigInt(Math.floor(amount * 1_000_000));

      const hash = await walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [newSafeAddress as Address, amountInUnits],
        account: legacySafeAddress as Address,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        const newBalance = await getUSDCBalance(legacySafeAddress);
        setState(prev => ({ 
          ...prev, 
          legacyBalance: newBalance,
          isTransferring: false 
        }));
        return true;
      } else {
        throw new Error("Transfer failed");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to transfer USDC";
      setState(prev => ({ ...prev, isTransferring: false, error: message }));
      throw err;
    }
  }, [legacySafeAddress, newSafeAddress, walletClient, publicClient]);

  return {
    ...state,
    legacySafeAddress,
    checkLegacySafe,
    deployLegacySafe,
    transferToNewSafe,
  };
}
