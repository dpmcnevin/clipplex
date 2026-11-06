<script>
  import "../app.css";
  import { page } from "$app/stores";
  import Toast from "$lib/components/Toast.svelte";
  import Overlay from "$lib/components/Overlay.svelte";

  let { children } = $props();
</script>

<svelte:head>
  <script src="/js/all.min.js" crossorigin="anonymous"></script>
</svelte:head>

<header class="topbar">
  <a class="brand" href="/">
    <img src="/icons/clipplex_icon.png" width="32" height="32" alt="" />
    <span>Clipplex</span>
  </a>
  <nav class="topnav">
    <a href="/" class:active={$page.url.pathname === "/"}>
      <i class="fas fa-hand-scissors"></i><span>Clips</span>
    </a>
    <a href="/snapshots" class:active={$page.url.pathname === "/snapshots"}>
      <i class="fas fa-camera-retro"></i><span>Snapshots</span>
    </a>
  </nav>
</header>

<main class="page">
  {@render children()}
</main>

<Toast />
<Overlay />
