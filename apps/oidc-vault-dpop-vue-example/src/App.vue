<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { fetchWithDpop, OidcVaultDpopClientError } from '@web-ts-toolkit/oidc-vault-dpop-client';

import { apis, backendOrigin, getSession } from './auth';

// One session per page lifetime; the same persistent IndexedDB key backs every proof.
const session = getSession();

type Phase = 'starting' | 'signed-in' | 'login-required' | 'error';

const phase = ref<Phase>('starting');
const message = ref('Starting…');
const result = ref('');
const busy = ref(false);

const fail = (error: unknown): void => {
  phase.value = error instanceof OidcVaultDpopClientError && error.requiresLogin ? 'login-required' : 'error';
  message.value = error instanceof Error ? error.message : 'The operation failed.';
  result.value = '';
};

const run = (operation: () => Promise<void>): void => {
  busy.value = true;
  void operation()
    .catch(fail)
    .finally(() => {
      busy.value = false;
    });
};

const signIn = (): Promise<void> => session.login('/callback');
const refresh = async (): Promise<void> => {
  await session.refresh();
  phase.value = 'signed-in';
  message.value = 'Signed in · body transport · DPoP · JWT in memory only';
};
const logout = async (): Promise<void> => {
  await session.logout();
  phase.value = 'login-required';
  message.value = 'Signed out. Sign in to continue.';
  result.value = '';
};
const getProfile = async (): Promise<void> => {
  const response = await fetchWithDpop({ session, apis }, `${backendOrigin}/api/profile`);
  if (!response.ok) throw new Error('The protected API request failed.');
  result.value = JSON.stringify(await response.json(), null, 2);
  phase.value = 'signed-in';
  message.value = 'Signed in · body transport · DPoP · JWT in memory only';
};

onMounted(() => {
  const boot = async (): Promise<void> => {
    try {
      const page = new URL(location.href);
      const code = page.searchParams.get('code');
      if (code) {
        // Remove the one-time code before asynchronous exchange; refresh never retries it.
        page.searchParams.delete('code');
        history.replaceState(null, '', page.href);
        await session.exchange(code);
      } else {
        await session.refresh();
      }
      phase.value = 'signed-in';
      message.value = 'Signed in · body transport · DPoP · JWT in memory only';
    } catch (error) {
      fail(error);
    }
  };
  void boot();
});
</script>

<template>
  <main>
    <h1>OIDC vault · DPoP · Vue</h1>
    <p>Persistent non-extractable browser key, memory-only JWT, real OIDC navigation.</p>
    <p>Backend: {{ backendOrigin }} · {{ phase }} · {{ message }}</p>
    <nav>
      <button type="button" :disabled="busy" @click="run(signIn)">Sign in via OIDC provider</button>
      <button type="button" :disabled="busy" @click="run(getProfile)">GET protected profile</button>
      <button type="button" :disabled="busy" @click="run(refresh)">Refresh (also after JWT expiry)</button>
      <button type="button" :disabled="busy" @click="run(logout)">Log out</button>
    </nav>
    <pre>{{ result }}</pre>
  </main>
</template>
