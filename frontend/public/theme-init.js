(() => {
  try {
    const stored = localStorage.getItem("ina-theme");
    const mode = stored === "dark" || stored === "light"
      ? stored
      : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", mode);
    document.documentElement.style.colorScheme = mode;
  } catch {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
