export class DpopNonceCache {
  private readonly nonces = new Map<string, string>();

  get(space: string, jkt: string): string | undefined {
    return this.nonces.get(JSON.stringify([space, jkt]));
  }

  remember(space: string, jkt: string, nonce: string | null): boolean {
    if (!nonce || nonce.length > 512 || !/^[\x20-\x7e]+$/.test(nonce)) return false;
    this.nonces.set(JSON.stringify([space, jkt]), nonce);
    return true;
  }

  clear(): void {
    this.nonces.clear();
  }
}
