import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

// Check if a shim package should be created (only if package doesn't exist or is already a shim)
async function shouldCreateShim(packageDir: string): Promise<boolean> {
  try {
    const pkgJson = await readFile(path.join(packageDir, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgJson);
    // Only overwrite if it's already our shim (version 0.0.0-shim)
    return pkg.version === "0.0.0-shim";
  } catch {
    // Package doesn't exist, create the shim
    return true;
  }
}

// Create Solana shim packages for Privy compatibility (EVM-only project)
async function createSolanaShims() {
  console.log("checking Solana shim packages for Privy compatibility...");
  
  // @solana/kit shim
  const solanaKitDir = path.join(process.cwd(), "node_modules/@solana/kit");
  
  // Create each shim independently - don't early return so all packages are checked
  if (await shouldCreateShim(solanaKitDir)) {
    console.log("creating @solana/kit shim...");
    await mkdir(solanaKitDir, { recursive: true });
  
    await writeFile(path.join(solanaKitDir, "package.json"), JSON.stringify({
      name: "@solana/kit",
      version: "0.0.0-shim",
      main: "index.js",
      module: "index.mjs"
    }, null, 2));
  
    const solanaKitShim = `// Comprehensive shim for @solana/kit - Privy optional dependency (EVM-only project)
// Decoders/Encoders
export const getTransactionDecoder = () => ({ decode: () => null });
export const getTransactionEncoder = () => ({ encode: () => new Uint8Array() });
export const getTransactionCodec = () => ({});
export const getCompiledTransactionMessageDecoder = () => ({ decode: () => ({}) });
export const getCompiledTransactionMessageDecoder_ = () => ({ decode: () => ({}) });
export const getCompiledTransactionMessageEncoder = () => ({ encode: () => new Uint8Array() });
export const getBase64Decoder = () => ({ decode: () => new Uint8Array() });
export const getBase58Decoder = () => ({ decode: () => new Uint8Array() });
export const getBase64Encoder = () => ({ encode: () => "" });
export const getBase58Encoder = () => ({ encode: () => "" });
export const getAddressDecoder = () => ({ decode: () => "" });
export const getAddressEncoder = () => ({ encode: () => new Uint8Array() });
export const getSignatureDecoder = () => ({ decode: () => "" });
export const getSignatureEncoder = () => ({ encode: () => new Uint8Array() });

// Address utilities
export const address = (str) => str;
export const getAddressFromPublicKey = () => "";
export const isAddress = () => true;

// Transaction creation
export const createTransaction = () => ({});
export const signTransaction = async () => ({});
export const sendTransaction = async () => ({});
export const compileTransaction = () => ({});
export const getSignatureFromTransaction = () => "";
export const getBase64EncodedWireTransaction = () => "";
export const decompileTransaction = async () => ({});

// Transaction message
export const createTransactionMessage = () => ({});
export const setTransactionMessageFeePayer = (addr, tx) => tx;
export const setTransactionMessageFeePayer_ = (addr, tx) => tx;
export const setTransactionMessageFeePayerSigner = (signer, tx) => tx;
export const setTransactionMessageLifetimeUsingBlockhash = (hash, tx) => tx;
export const appendTransactionMessageInstruction = (instr, tx) => tx;
export const appendTransactionMessageInstructions = (instrs, tx) => tx;
export const signTransactionMessageWithSigners = async () => ({});
export const prependTransactionMessageInstruction = (instr, tx) => tx;
export const prependTransactionMessageInstructions = (instrs, tx) => tx;
export const decompileTransactionMessage = async () => ({});

// Blockhash
export const blockhash = (str) => str;

// Address lookup tables
export const fetchAddressesForLookupTables = async () => ({});
export const getAddressLookupTableAccountDataDecoder = () => ({ decode: () => ({}) });
export const fetchAddressLookupTable = async () => ({});
export const getAddressTableLookupCodec = () => ({});

// Pipe utility
export const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x);

// RPC
export const createSolanaRpc = () => ({ 
  getLatestBlockhash: () => ({ send: async () => ({ value: {} }) }),
  sendTransaction: () => ({ send: async () => "" }),
  getBalance: () => ({ send: async () => ({ value: 0n }) }),
  getAccountInfo: () => ({ send: async () => null }),
  getMultipleAccounts: () => ({ send: async () => ({ value: [] }) }),
});
export const createSolanaRpcSubscriptions = () => ({});
export const devnet = (url) => url;
export const mainnet = (url) => url;
export const testnet = (url) => url;

// Utilities
export const lamports = (n) => BigInt(n);
export const createKeyPairFromBytes = () => ({});
export const generateKeyPairSigner = async () => ({});
export const createSignerFromKeyPair = () => ({});
export const createSignableMessage = () => ({});

// Factories
export const sendAndConfirmTransactionFactory = () => async () => ({});
export const getComputeUnitEstimateForTransactionMessageFactory = () => async () => 0;
export const airdropFactory = () => async () => ({});

// Assertions/validators
export const assertIsFullySignedTransaction = () => {};
export const assertIsSendableTransaction = () => {};
export const isFullySignedTransaction = () => false;
export const isSendableTransaction = () => false;
export const isSolanaError = () => false;
export const assertIsTransactionMessageWithSingleSendingSigner = () => {};
export const isTransactionMessageWithSingleSendingSigner = () => true;

// Signers
export const getSignersFromTransaction = () => [];
export const getSignersFromInstruction = () => [];
export const partiallySignTransactionMessageWithSigners = async () => ({});

// Account utilities
export const decodeAccount = () => ({});
export const fetchEncodedAccount = async () => ({});
export const fetchEncodedAccounts = async () => ([]);
export const getAccountDecoder = () => ({ decode: () => ({}) });

// Message utilities
export const getTransactionMessageEncoder = () => ({ encode: () => new Uint8Array() });
export const getTransactionMessageDecoder = () => ({ decode: () => ({}) });

export default {};
`;
  
    await writeFile(path.join(solanaKitDir, "index.mjs"), solanaKitShim);
    await writeFile(path.join(solanaKitDir, "index.js"), solanaKitShim);
  } else {
    console.log("@solana/kit already exists with real package, skipping shim");
  }
  
  // @solana-program/system shim
  const systemDir = path.join(process.cwd(), "node_modules/@solana-program/system");
  if (await shouldCreateShim(systemDir)) {
    console.log("creating @solana-program/system shim...");
    await mkdir(systemDir, { recursive: true });
    
    await writeFile(path.join(systemDir, "package.json"), JSON.stringify({
      name: "@solana-program/system",
      version: "0.0.0-shim",
      main: "index.js",
      module: "index.mjs"
    }, null, 2));
    
    const systemShim = `export const getTransferSolInstruction = () => ({});
export const SYSTEM_PROGRAM_ADDRESS = "11111111111111111111111111111111";
export const createAccountInstruction = () => ({});
export default {};
`;
    
    await writeFile(path.join(systemDir, "index.mjs"), systemShim);
    await writeFile(path.join(systemDir, "index.js"), systemShim);
  } else {
    console.log("@solana-program/system already exists with real package, skipping shim");
  }
  
  // @solana-program/token shim
  const tokenDir = path.join(process.cwd(), "node_modules/@solana-program/token");
  if (await shouldCreateShim(tokenDir)) {
    console.log("creating @solana-program/token shim...");
    await mkdir(tokenDir, { recursive: true });
    
    await writeFile(path.join(tokenDir, "package.json"), JSON.stringify({
      name: "@solana-program/token",
      version: "0.0.0-shim",
      main: "index.js",
      module: "index.mjs"
    }, null, 2));
  
    const tokenShim = `export const findAssociatedTokenPda = async () => ["", 0];
export const getTransferInstruction = () => ({});
export const getCreateAssociatedTokenIdempotentInstruction = () => ({});
export const getCreateAssociatedTokenInstruction = () => ({});
export const TOKEN_PROGRAM_ADDRESS = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export default {};
`;
  
    await writeFile(path.join(tokenDir, "index.mjs"), tokenShim);
    await writeFile(path.join(tokenDir, "index.js"), tokenShim);
  } else {
    console.log("@solana-program/token already exists with real package, skipping shim");
  }
  
  console.log("Solana shim packages created/verified successfully.");
}

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  // Create Solana shims before Vite build
  await createSolanaShims();

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
