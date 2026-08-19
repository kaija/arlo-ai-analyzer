// Arlo — shared chrome behavior (theme, sidebar, sortable tables, dismissible strips)
(function () {
  const root = document.documentElement;
  const THEME_KEY = "arlo-theme";
  const SIDEBAR_KEY = "arlo-sidebar-collapsed";

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) applyTheme(saved);
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
        applyTheme(current === "dark" ? "light" : "dark");
      });
    });
  }

  function initSidebar() {
    const sidebar = document.querySelector(".sidebar");
    const btn = document.querySelector("[data-sidebar-toggle]");
    if (!sidebar || !btn) return;
    if (localStorage.getItem(SIDEBAR_KEY) === "1") sidebar.classList.add("collapsed");
    btn.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
      localStorage.setItem(SIDEBAR_KEY, sidebar.classList.contains("collapsed") ? "1" : "0");
    });
  }

  function initDismissibles() {
    document.querySelectorAll("[data-dismiss]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.closest("[data-dismissible]");
        if (target) target.style.display = "none";
      });
    });
  }

  // Click-to-pin popovers (info-dot) — accessible alternative to hover-only
  function initPopovers() {
    document.querySelectorAll(".info-dot").forEach((dot) => {
      dot.setAttribute("tabindex", "0");
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = dot.classList.contains("pinned");
        document.querySelectorAll(".info-dot.pinned").forEach((d) => d.classList.remove("pinned"));
        if (!isOpen) dot.classList.add("pinned");
      });
    });
    document.addEventListener("click", () => {
      document.querySelectorAll(".info-dot.pinned").forEach((d) => d.classList.remove("pinned"));
    });
  }

  // Generic client-side sortable table: th[data-sort-key] + tbody rows with matching td[data-value]
  function initSortableTables() {
    document.querySelectorAll(".dtable[data-sortable]").forEach((table) => {
      const tbody = table.querySelector("tbody");
      table.querySelectorAll("th.sortable").forEach((th) => {
        th.addEventListener("click", () => {
          const key = th.dataset.sortKey;
          const asc = !(th.dataset.sortDir === "asc");
          table.querySelectorAll("th.sortable").forEach((t) => {
            t.classList.remove("sort-active");
            t.querySelector(".sort-arrow") && (t.querySelector(".sort-arrow").textContent = "↕");
          });
          th.classList.add("sort-active");
          th.dataset.sortDir = asc ? "asc" : "desc";
          const arrow = th.querySelector(".sort-arrow");
          if (arrow) arrow.textContent = asc ? "↑" : "↓";
          const rows = Array.from(tbody.querySelectorAll("tr"));
          rows.sort((a, b) => {
            const av = a.querySelector(`[data-col="${key}"]`)?.dataset.value ?? "";
            const bv = b.querySelector(`[data-col="${key}"]`)?.dataset.value ?? "";
            const an = parseFloat(av), bn = parseFloat(bv);
            const cmp = !isNaN(an) && !isNaN(bn) ? an - bn : String(av).localeCompare(String(bv));
            return asc ? cmp : -cmp;
          });
          rows.forEach((r) => tbody.appendChild(r));
        });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initSidebar();
    initDismissibles();
    initPopovers();
    initSortableTables();
  });
})();
