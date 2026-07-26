import posthog from "posthog-js";

const nav = document.querySelector(".nav");
const updateNavigation = () => {
  if (!nav) return;
  nav.classList.toggle("is-scrolled", window.scrollY > 12);
};
window.addEventListener("scroll", updateNavigation, { passive: true });
updateNavigation();

const starCount = document.getElementById("github-star-count");
const formatStars = (count: number) =>
  new Intl.NumberFormat("en", {
    notation: count >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(count);

fetch("https://api.github.com/repos/krl-gr/upcomputer")
  .then((response) => {
    if (!response.ok) throw new Error("GitHub request failed");
    return response.json() as Promise<{ stargazers_count?: unknown }>;
  })
  .then((repository) => {
    if (!starCount || typeof repository.stargazers_count !== "number") return;
    starCount.textContent = formatStars(repository.stargazers_count);
    starCount.hidden = false;
  })
  .catch(() => {});

const resizeStaticMockup = (viewport: HTMLElement) => {
  const widthScale = viewport.clientWidth / 1120;
  const heightScale = viewport.clientHeight / 750;
  const scale =
    viewport.dataset.staticAppFit === "contain"
      ? Math.min(widthScale, heightScale)
      : Math.max(widthScale, heightScale);
  viewport.style.setProperty("--mock-scale", String(scale));
};

const staticViewports = document.querySelectorAll<HTMLElement>("[data-static-app-viewport]");
const staticObserver = new ResizeObserver((entries) => {
  for (const entry of entries) resizeStaticMockup(entry.target as HTMLElement);
});
for (const viewport of staticViewports) {
  resizeStaticMockup(viewport);
  staticObserver.observe(viewport);
}

const resizeMultiChat = (viewport: HTMLElement) => {
  const inset = 34;
  const scale = Math.min(
    Math.max(0, viewport.clientWidth - inset * 2) / 1440,
    Math.max(0, viewport.clientHeight - inset * 2) / 900,
  );
  viewport.style.setProperty("--multi-scale", String(scale));
};

const multiChatViewports = document.querySelectorAll<HTMLElement>("[data-multi-chat-viewport]");
const multiChatObserver = new ResizeObserver((entries) => {
  for (const entry of entries) resizeMultiChat(entry.target as HTMLElement);
});
for (const viewport of multiChatViewports) {
  resizeMultiChat(viewport);
  multiChatObserver.observe(viewport);
}

const posthogProjectKey = import.meta.env.PUBLIC_POSTHOG_KEY?.trim();
const posthogHost = import.meta.env.PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
const isProductionSite = window.location.hostname === "up.computer";
const globalPrivacyControl = (navigator as Navigator & { globalPrivacyControl?: boolean })
  .globalPrivacyControl;
const analyticsOptOut = navigator.doNotTrack === "1" || globalPrivacyControl === true;
let analyticsReady = false;
if (import.meta.env.DEV) document.documentElement.dataset.analyticsStatus = "disabled";

const analyticsProperties = (link: HTMLAnchorElement) => {
  const properties: Record<string, string> = {};
  for (const [key, value] of Object.entries(link.dataset)) {
    if (!key.startsWith("analytics") || key === "analyticsEvent" || value === undefined) continue;
    const propertyName = key
      .slice("analytics".length)
      .replace(/^[A-Z]/u, (character) => character.toLowerCase())
      .replace(/[A-Z]/gu, (character) => `_${character.toLowerCase()}`);
    properties[propertyName] = value;
  }
  return properties;
};

if (isProductionSite && posthogProjectKey && !analyticsOptOut) {
  if (import.meta.env.DEV) document.documentElement.dataset.analyticsStatus = "loading";
  posthog.init(posthogProjectKey, {
    api_host: posthogHost,
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_heatmaps: false,
    capture_performance: {
      network_timing: false,
      web_vitals: true,
      web_vitals_attribution: false,
    },
    disable_session_recording: true,
    person_profiles: "never",
    cookieless_mode: "always",
    respect_dnt: true,
    opt_out_useragent_filter: import.meta.env.DEV,
    disable_compression: import.meta.env.DEV,
    request_batching: false,
    ip: false,
    loaded: (client) => {
      client.register({
        surface: "marketing_web",
        environment: "production",
      });
      analyticsReady = true;
      queueMicrotask(() => client.capture("$pageview"));
      if (import.meta.env.DEV) document.documentElement.dataset.analyticsStatus = "ready";
    },
  });
}

document.addEventListener("click", (event) => {
  if (!analyticsReady || !(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>("a[data-analytics-event]");
  const eventName = link?.dataset.analyticsEvent;
  if (!link || !eventName) return;
  posthog.capture(eventName, analyticsProperties(link));
});
