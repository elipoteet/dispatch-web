"use client";

import { useEffect, useState } from "react";

// Mirrors ThemeToggle's currentTheme() logic — theme lives as a data-theme
// attribute on <html> (or falls back to the OS preference), not React state,
// so components that need to branch on it in JS have to watch for changes.
function readTheme(): "light" | "dark" {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(readTheme() === "dark");

    const observer = new MutationObserver(() => setIsDark(readTheme() === "dark"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setIsDark(readTheme() === "dark");
    mq.addEventListener("change", onChange);

    return () => {
      observer.disconnect();
      mq.removeEventListener("change", onChange);
    };
  }, []);

  return isDark;
}
