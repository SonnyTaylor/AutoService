import App from './App.svelte';

const app = new App({
  target: document.getElementById('content') || document.body,
  props: {}
});

export default app;
