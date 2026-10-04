import { createApp } from 'vue';

import App from './App.vue';

const mount = document.querySelector('#app');
if (!mount) throw new Error('Missing #app element.');

createApp(App).mount(mount);
