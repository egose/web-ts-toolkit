const MAX_ENTRIES = 64;

/**
 * In-memory opaque nonces, isolated by the caller's trusted protection space and
 * signing-key thumbprint. At most 64 tuples: a successful remember renews write
 * order; insertion at capacity evicts the oldest remembered tuple. Reads do not
 * promote entries. No TTL or server-specific nonce decoding is performed.
 */
export class DpopNonceCache {
  private readonly nonces = new Map<string, string>();

  get(space: string, jkt: string): string | undefined {
    return this.nonces.get(JSON.stringify([space, jkt]));
  }

  /**
   * Accept one 1..512-character visible-ASCII value, excluding whitespace,
   * double quotes, backslashes and commas (including coalesced duplicate header
   * values). Invalid input returns false without overwriting or changing order.
   */
  remember(space: string, jkt: string, nonce: string | null): boolean {
    // OAuth NQCHAR minus comma: Fetch cannot distinguish a comma-containing
    // nonce from multiple coalesced DPoP-Nonce fields. Never split or unquote it.
    if (typeof nonce !== 'string' || nonce.length > 512 || !/^[\x21\x23-\x2b\x2d-\x5b\x5d-\x7e]+$/.test(nonce))
      return false;
    const id = JSON.stringify([space, jkt]);
    this.nonces.delete(id);
    if (this.nonces.size === MAX_ENTRIES) this.nonces.delete(this.nonces.keys().next().value!);
    this.nonces.set(id, nonce);
    return true;
  }

  /** Forget every tuple in this cache; does not invalidate credentials or server nonce state. */
  clear(): void {
    this.nonces.clear();
  }
}
