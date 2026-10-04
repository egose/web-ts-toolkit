import { Component, signal, type OnInit } from '@angular/core';
import { fetchWithDpop, OidcVaultDpopClientError } from '@web-ts-toolkit/oidc-vault-dpop-client';

import { apis, backendOrigin, getSession } from '../auth';

type Phase = 'starting' | 'signed-in' | 'login-required' | 'error';

@Component({
  selector: 'app-root',
  standalone: true,
  template: `
    <main>
      <h1>OIDC vault · DPoP · Angular</h1>
      <p>Persistent non-extractable browser key, memory-only JWT, real OIDC navigation.</p>
      <p>Backend: {{ backendOrigin }} · {{ phase() }} · {{ message() }}</p>
      <nav>
        <button type="button" [disabled]="busy()" (click)="run(signIn)">Sign in via OIDC provider</button>
        <button type="button" [disabled]="busy()" (click)="run(getProfile)">GET protected profile</button>
        <button type="button" [disabled]="busy()" (click)="run(refresh)">Refresh (also after JWT expiry)</button>
        <button type="button" [disabled]="busy()" (click)="run(logOut)">Log out</button>
      </nav>
      <pre>{{ result() }}</pre>
    </main>
  `,
})
export class AppComponent implements OnInit {
  readonly backendOrigin = backendOrigin;
  readonly phase = signal<Phase>('starting');
  readonly message = signal('Starting…');
  readonly result = signal('');
  readonly busy = signal(false);

  // One session per page lifetime; the same persistent IndexedDB key backs every proof.
  private readonly session = getSession();

  private fail(error: unknown): void {
    this.phase.set(error instanceof OidcVaultDpopClientError && error.requiresLogin ? 'login-required' : 'error');
    this.message.set(error instanceof Error ? error.message : 'The operation failed.');
    this.result.set('');
  }

  async ngOnInit(): Promise<void> {
    try {
      const page = new URL(location.href);
      const code = page.searchParams.get('code');
      if (code) {
        // Remove the one-time code before asynchronous exchange; refresh never retries it.
        page.searchParams.delete('code');
        history.replaceState(null, '', page.href);
        await this.session.exchange(code);
      } else {
        await this.session.refresh();
      }
      this.phase.set('signed-in');
      this.message.set('Signed in · body transport · DPoP · JWT in memory only');
    } catch (error) {
      this.fail(error);
    }
  }

  run(operation: () => Promise<void>): void {
    this.busy.set(true);
    void operation()
      .catch((error: unknown) => this.fail(error))
      .finally(() => this.busy.set(false));
  }

  signIn = (): Promise<void> => this.session.login('/callback');

  getProfile = async (): Promise<void> => {
    const response = await fetchWithDpop({ session: this.session, apis }, `${backendOrigin}/api/profile`);
    if (!response.ok) throw new Error('The protected API request failed.');
    this.result.set(JSON.stringify(await response.json(), null, 2));
    this.phase.set('signed-in');
    this.message.set('Signed in · body transport · DPoP · JWT in memory only');
  };

  refresh = async (): Promise<void> => {
    await this.session.refresh();
    this.phase.set('signed-in');
    this.message.set('Signed in · body transport · DPoP · JWT in memory only');
  };

  logOut = async (): Promise<void> => {
    await this.session.logout();
    this.phase.set('login-required');
    this.message.set('Signed out. Sign in to continue.');
    this.result.set('');
  };
}
