// Shim for @solana/kit - Privy optional dependency
// We don't use Solana features, so export empty stubs that satisfy the import requirements

export const getTransactionDecoder = () => ({
  decode: () => null
});

export const getBase64Decoder = () => ({
  decode: () => new Uint8Array()
});

export const getBase58Encoder = () => ({
  encode: () => ""
});

export const getBase64Encoder = () => ({
  encode: () => ""
});

// Additional exports that might be needed
export const createTransaction = () => ({});
export const signTransaction = () => ({});
export const sendTransaction = () => ({});

export default {
  getTransactionDecoder,
  getBase64Decoder,
  getBase58Encoder,
  getBase64Encoder,
  createTransaction,
  signTransaction,
  sendTransaction
};
