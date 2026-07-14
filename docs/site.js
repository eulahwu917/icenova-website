(() => {
  const track = document.querySelector("#product-world");
  const visuals = [...document.querySelectorAll(".visual")];
  const copies = [...document.querySelectorAll(".scene-copy")];
  const markers = [...document.querySelectorAll(".world-progress span")];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let frame = 0;

  const updateWorld = () => {
    frame = 0;
    const max = Math.max(1, track.offsetHeight - window.innerHeight);
    const progress = Math.max(0, Math.min(1, (window.scrollY - track.offsetTop) / max));
    const active = Math.min(visuals.length - 1, Math.floor(progress * visuals.length));
    const local = progress * visuals.length - active;

    visuals.forEach((visual, index) => {
      const selected = index === active;
      visual.classList.toggle("is-active", selected);
      if (!reduceMotion) visual.querySelector("img").style.transform = selected ? `scale(${1.08 - local * 0.06})` : "scale(1.08)";
    });
    copies.forEach((copy, index) => copy.classList.toggle("is-active", index === active));
    markers.forEach((marker, index) => marker.classList.toggle("is-active", index === active));
  };

  const requestUpdate = () => {
    if (!frame) frame = requestAnimationFrame(updateWorld);
  };

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  updateWorld();

  const stores = Array.isArray(window.ICE_NOVA_STORES) ? window.ICE_NOVA_STORES : [];
  const form = document.querySelector("#store-search");
  const input = document.querySelector("#store-query");
  const results = document.querySelector("#store-results");
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = input.value.trim().toLowerCase();
    if (!query) {
      results.innerHTML = '<p class="empty">Enter a ZIP code, city, or store name.</p>';
      input.focus();
      return;
    }

    const allMatches = stores.filter((store) => [store.name, store.banner, store.address, store.city, store.state, store.zip].some((value) => String(value).toLowerCase().includes(query)));
    const matches = allMatches.slice(0, 6);
    if (!matches.length) {
      results.innerHTML = '<p class="empty">No matching stores found. Try a nearby city or five-digit ZIP code.</p>';
      return;
    }

    const summary = allMatches.length > 6 ? `Showing 6 of ${allMatches.length} matching stores` : `${allMatches.length} matching ${allMatches.length === 1 ? "store" : "stores"}`;
    results.innerHTML = `<div class="result-summary">${summary}</div>${matches.map((store) => {
      const address = `${store.address}, ${store.city}, ${store.state} ${store.zip}`;
      const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
      return `<article class="result"><div><strong>${escapeHtml(store.name)}</strong><address>${escapeHtml(address)}</address></div><a class="directions" href="${map}" target="_blank" rel="noreferrer">Directions &rarr;<span class="sr-only"> to ${escapeHtml(store.name)}</span></a></article>`;
    }).join("")}`;
  });
})();
