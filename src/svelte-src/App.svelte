<script>
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/tauri';
  let msg = 'Hello from Svelte';
  onMount(async () => {
    try {
      // example invoke, replace with real command
      // const res = await invoke('some_command');
      // msg = res;
    } catch (e) {
      // ignore
    }
  });
</script>

<style>
  h1 { font-family: system-ui, sans-serif; }
</style>

<main>
  <h1>{msg}</h1>
  <p>This is a minimal Svelte entry for incremental migration.</p>
</main>
