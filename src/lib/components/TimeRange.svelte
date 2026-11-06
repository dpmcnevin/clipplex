<script>
  let { label, parts = $bindable(["", "", ""]), children } = $props();

  let inputs = $state([]);

  function onInput(index, event) {
    const digits = event.target.value.replace(/\D/g, "");
    parts[index] = digits;
    if (digits.length === 2 && index < 2) {
      inputs[index + 1]?.focus();
      inputs[index + 1]?.select();
    }
  }

  const clear = () => (parts = ["", "", ""]);
</script>

<div class="field">
  <label for="{label}-0">{label}</label>
  <div class="timegroup">
    {#each ["HH", "MM", "SS"] as placeholder, index}
      {#if index > 0}<span class="sep">:</span>{/if}
      <input
        id="{label}-{index}"
        type="text"
        inputmode="numeric"
        maxlength="2"
        {placeholder}
        bind:this={inputs[index]}
        value={parts[index]}
        oninput={(event) => onInput(index, event)}
      />
    {/each}
  </div>
  <button type="button" class="icon-btn" onclick={clear} title="Clear {label.toLowerCase()} time">
    <i class="fas fa-times"></i>
  </button>
  {@render children?.()}
</div>
