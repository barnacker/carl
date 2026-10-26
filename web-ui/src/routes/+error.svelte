<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>CARL — {page.url.pathname}</title>
</svelte:head>

<div class="err">
  <p>{page.status}: {page.error?.message ?? 'Something went wrong'}</p>
  <button onclick={() => window.location.reload()}>Retry</button>
</div>

<style>
  .err {
    font-family: ui-sans-serif, system-ui, sans-serif;
    color: #d7e0ea;
    background: #05080c;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    letter-spacing: 0.02em;
  }
</style>
