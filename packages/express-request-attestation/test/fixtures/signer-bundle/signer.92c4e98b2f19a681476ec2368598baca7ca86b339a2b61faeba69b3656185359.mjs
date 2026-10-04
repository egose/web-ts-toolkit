import { createRequestSigner } from "./runtime.43d902e6c045a683aafb8864fbd804843317ba608365e5d48f69ed53c075079e.mjs";
const __attestationKeyBytes = new Uint8Array([217,115,195,93,166,35,162,50,157,208,138,50,21,54,53,4,42,127,233,11,115,0,53,201,5,8,174,126,197,12,13,36]);
export const signer = createRequestSigner({
  keyId: "fixture-key-01",
  key: __attestationKeyBytes,
  publicOrigin: "https://attestation.example.com",
  replayNamespace: "att-fixture",
});
