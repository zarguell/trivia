/** Tiny dependency-free HTML toolkit for the static site generator. */

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]));

export const attr = (obj) => Object.entries(obj)
  .filter(([, v]) => v !== false && v !== null && v !== undefined)
  .map(([k, v]) => v === true ? k : `${k}="${esc(v)}"`)
  .join(" ");

const ICONS = {
  today: '<rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 2.5v5M16 2.5v5M3.5 10.5h17"/><path d="M8 14.5h2M14 14.5h2M8 18h2"/>',
  study: '<path d="M12 6.5C10 4.8 7.2 4 4 4v14.5c3.2 0 6 .8 8 2.5 2-1.7 4.8-2.5 8-2.5V4c-3.2 0-6 .8-8 2.5Z"/><path d="M12 6.5V21"/>',
  endless: '<path d="M8.6 8.6c3.2 0 4.8 6.8 8 6.8a3.4 3.4 0 1 0 0-6.8c-3.2 0-4.8 6.8-8 6.8a3.4 3.4 0 1 1 0-6.8Z"/>',
  archive: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4.4-4.4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
};

export function icon(name, cls = "ico") {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
}

const NAV = [
  ["today", "Today", "daily/"],
  ["study", "Study", "study/"],
  ["endless", "Endless", "endless/"],
  ["archive", "Lookup", "archive/"],
  ["about", "About", "about/"],
];

export function layout({
  base = "/trivia/", title, description, page = "", active = "", content,
  bodyClass = "", preload = "", scriptData = "", narrow = false, showFooter = true,
  ogTitle = "", ogDescription = "", ogUrl = "", ogImage = "", ogType = "website",
  canonical = "", robots = "",
}) {
  const fullTitle = title === "Six Things"
    ? "Six Things — the trivia you actually need"
    : `${title} · Six Things`;
  const socialTitle = ogTitle || fullTitle;
  const socialDescription = ogDescription || description;
  const socialImage = ogImage || `https://zarguell.github.io${base}assets/og.png`;
  return `<!doctype html>
<html lang="en" data-base="${base}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}
${robots ? `<meta name="robots" content="${esc(robots)}">` : ""}
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0a1020">
<link rel="icon" href="${base}assets/icon.svg" type="image/svg+xml">
<link rel="manifest" href="${base}manifest.webmanifest">
<link rel="stylesheet" href="${base}assets/app.css">
${preload}
<script>try{var t=localStorage.getItem("sixthings.v1");var th=t&&JSON.parse(t).theme;
if(th!=="light"&&th!=="dark"){th=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}
document.documentElement.dataset.theme=th;var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=th==="light"?"#f6f2e8":"#080d18";}catch(e){}</script>
<meta property="og:site_name" content="Six Things">
<meta property="og:title" content="${esc(socialTitle)}">
<meta property="og:description" content="${esc(socialDescription)}">
<meta property="og:type" content="${esc(ogType)}">
${ogUrl ? `<meta property="og:url" content="${esc(ogUrl)}">` : ""}
<meta property="og:image" content="${esc(socialImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Six Things">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(socialTitle)}">
<meta name="twitter:description" content="${esc(socialDescription)}">
<meta name="twitter:image" content="${esc(socialImage)}">
</head>
<body data-page="${esc(page)}" class="${esc(bodyClass)}">
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
  <div class="wrap topbar-in">
    <a class="brand" href="${base}" aria-label="Six Things, today">
      <span class="brand-mark">6</span><span class="brand-word">Six&nbsp;Things</span>
    </a>
    <nav class="topnav" aria-label="Main">
      ${NAV.map(([id, label, href]) => `<a href="${base}${href}"${active === id ? ' class="is-active" aria-current="page"' : ""}>${label}</a>`).join("")}
    </nav>
    <button class="iconbtn theme-toggle" type="button" data-action="theme" aria-label="Switch theme">
      <span class="only-dark">${icon("sun")}</span><span class="only-light">${icon("moon")}</span>
    </button>
  </div>
</header>
<main id="main" class="wrap${narrow ? " wrap--narrow" : ""}">
${content}
</main>
<p class="sr-only" aria-live="polite" data-share-status></p>
${showFooter ? `<footer class="footer wrap">
  <span class="footer__brand">Six Things</span>
  <a href="${base}about/">About</a>
  <a href="https://github.com/zarguell/trivia">Source</a>
  <span class="fine">Unaffiliated fan project. Clues © Jeopardy Productions.</span>
</footer>` : ""}
<nav class="tabbar" aria-label="Sections">
  ${NAV.slice(0, 4).map(([id, label, href]) => `<a href="${base}${href}"${active === id ? ' class="is-active" aria-current="page"' : ""}>
    ${icon(id === "today" ? "today" : id === "study" ? "study" : id === "endless" ? "endless" : "archive")}
    <span>${label}</span></a>`).join("")}
</nav>
${scriptData}
<script type="module" src="${base}assets/app.js"></script>
</body>
</html>`;
}
