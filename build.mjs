/*
  build.mjs — baut aus posts/*.json die statische Seite in site/.

  Bewusst ein eigener Mini-Generator statt Framework: ~200 Zeilen, keine
  Konfiguration, volle Kontrolle. GitHub Pages deployt site/ als Artefakt.

  Aufruf:  node build.mjs        (oder automatisch am Ende von pipeline/lauf.mjs)
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.dirname(fileURLToPath(import.meta.url));
const POSTS_ORDNER = path.join(WURZEL, "posts");
const SEITEN_ORDNER = path.join(WURZEL, "seiten");
const ZIEL = path.join(WURZEL, "site");

const BLOG_NAME = "Boxenfunk";
const BLOG_CLAIM = "Motorsport & Simracing — kuratierte News auf Deutsch";
// GitHub Pages-Adresse des Repos; bei eigener Domain spaeter hier aendern.
const BLOG_URL = "https://brachyboost-lang.github.io/boxenfunk";

// Ressort -> Anzeigename + Badge-Farbe. Keine Fotos: die Farbkacheln SIND
// die visuelle Sprache der Seite (bewusste Entscheidung, kein Platzhalter-Look).
const RESSORTS = {
  "formel":      { name: "Formel",      farbe: "#e10600" },
  "langstrecke": { name: "Langstrecke", farbe: "#0057b8" },
  "gt-dtm":      { name: "GT & DTM",    farbe: "#00843d" },
  "nordschleife":{ name: "Nordschleife",farbe: "#f5a800" },
  "simracing":   { name: "Simracing",   farbe: "#6d28d9" }
};

// ---------------------------------------------------------------------------
// Kleine Helfer
// ---------------------------------------------------------------------------

function htmlSichern(text) {
  return String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function datumDeutsch(iso) {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin"
  });
}

// Absaetze (\n\n) zu <p>-Tags. Mehr Markdown braucht der Blog nicht.
function textZuHtml(text) {
  return text.split(/\n\n+/).map(function (absatz) {
    return `<p>${htmlSichern(absatz.trim())}</p>`;
  }).join("\n");
}

// ---------------------------------------------------------------------------
// Seiten-Template (Kopf, Fuss, Styles — ueberall gleich)
// ---------------------------------------------------------------------------

function seite(titel, inhalt, tiefe) {
  const p = tiefe === 1 ? "../" : "";   // Pfad-Prefix fuer Unterordner-Seiten
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="only light">
<title>${htmlSichern(titel)} – ${BLOG_NAME}</title>
<link rel="alternate" type="application/rss+xml" title="${BLOG_NAME}" href="${p}feed.xml">
<style>
  :root { color-scheme: only light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f7f7f5; color: #1a1a1a;
         font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.55; }
  header { background: #111; color: #fff; padding: 22px 16px; }
  header .innen, main, footer .innen { max-width: 720px; margin: 0 auto; }
  header a { color: #fff; text-decoration: none; }
  header h1 { margin: 0; font-size: 26px; letter-spacing: .5px; }
  header h1 span { color: #e10600; }
  header p { margin: 4px 0 0; color: #bbb; font-size: 14px; }
  main { padding: 24px 16px 48px; }
  .karte { background: #fff; border-radius: 12px; padding: 18px 20px; margin-bottom: 16px;
           box-shadow: 0 1px 3px rgba(0,0,0,.07); }
  .badge { display: inline-block; color: #fff; font-size: 12px; font-weight: 600;
           padding: 2px 10px; border-radius: 999px; margin-right: 8px; }
  .serie { font-size: 12px; color: #666; font-weight: 600; }
  .karte h2 { margin: 8px 0 4px; font-size: 19px; }
  .karte h2 a { color: #1a1a1a; text-decoration: none; }
  .karte h2 a:hover { color: #e10600; }
  .datum { font-size: 13px; color: #888; }
  article h2 { margin: 8px 0 4px; font-size: 24px; }
  .quellen { margin-top: 18px; padding-top: 12px; border-top: 1px solid #eee; font-size: 13px; color: #666; }
  .quellen a { color: #0057b8; }
  .transparenz { font-size: 12px; color: #999; margin-top: 8px; }
  footer { background: #111; color: #999; font-size: 13px; padding: 20px 16px; }
  footer a { color: #ccc; }
  .zurueck { font-size: 14px; }
  .zurueck a { color: #0057b8; text-decoration: none; }
</style>
</head>
<body>
<header><div class="innen">
  <h1><a href="${p}index.html">BOXEN<span>FUNK</span></a></h1>
  <p>${BLOG_CLAIM}</p>
</div></header>
<main>
${inhalt}
</main>
<footer><div class="innen">
  <a href="${p}ueber.html">Über</a> · <a href="${p}impressum.html">Impressum</a> ·
  <a href="${p}datenschutz.html">Datenschutz</a> · <a href="${p}feed.xml">RSS</a>
  <p>Automatisch kuratierte Zusammenfassungen mit Quellenangabe. Kein Anspruch auf Vollständigkeit.</p>
</div></footer>
</body>
</html>`;
}

function badge(ressort) {
  const r = RESSORTS[ressort] || { name: ressort, farbe: "#555" };
  return `<span class="badge" style="background:${r.farbe}">${htmlSichern(r.name)}</span>`;
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

export function seiteBauen() {
  // Alle Posts laden, neueste zuerst.
  const posts = [];
  if (fs.existsSync(POSTS_ORDNER)) {
    for (const datei of fs.readdirSync(POSTS_ORDNER)) {
      if (!datei.endsWith(".json")) continue;
      const post = JSON.parse(fs.readFileSync(path.join(POSTS_ORDNER, datei), "utf8"));
      post.slug = datei.replace(/\.json$/, "");
      posts.push(post);
    }
  }
  posts.sort(function (a, b) { return new Date(b.datum) - new Date(a.datum); });

  // site/posts komplett neu aufbauen: sonst bleiben HTML-Leichen von Posts
  // liegen, die aus posts/ geloescht wurden (z. B. in der Schatten-Phase).
  fs.rmSync(path.join(ZIEL, "posts"), { recursive: true, force: true });
  fs.mkdirSync(path.join(ZIEL, "posts"), { recursive: true });

  // --- Startseite: Karten-Liste ---
  const karten = posts.map(function (post) {
    return `<div class="karte">
  ${badge(post.ressort)}<span class="serie">${htmlSichern(post.serie)}</span>
  <h2><a href="posts/${post.slug}.html">${htmlSichern(post.titel)}</a></h2>
  <div class="datum">${datumDeutsch(post.datum)}</div>
</div>`;
  }).join("\n");
  const startInhalt = posts.length
    ? karten
    : `<div class="karte"><p>Noch keine Beiträge — die Pipeline läuft an.</p></div>`;
  fs.writeFileSync(path.join(ZIEL, "index.html"), seite("Aktuell", startInhalt, 0));

  // --- Einzelne Post-Seiten ---
  for (const post of posts) {
    const quellenLinks = (post.quellen || []).map(function (q) {
      return `<a href="${htmlSichern(q.url)}" rel="noopener" target="_blank">${htmlSichern(q.name)}</a>`;
    }).join(" · ");
    const inhalt = `<p class="zurueck"><a href="../index.html">← Alle Beiträge</a></p>
<article class="karte">
  ${badge(post.ressort)}<span class="serie">${htmlSichern(post.serie)}</span>
  <h2>${htmlSichern(post.titel)}</h2>
  <div class="datum">${datumDeutsch(post.datum)}</div>
  ${textZuHtml(post.text)}
  <div class="quellen"><strong>Quellen:</strong> ${quellenLinks}</div>
  <div class="transparenz">Automatisch kuratierte Zusammenfassung des verlinkten Originalartikels.</div>
</article>`;
    fs.writeFileSync(path.join(ZIEL, "posts", `${post.slug}.html`), seite(post.titel, inhalt, 1));
  }

  // --- Statische Seiten aus seiten/*.html-Schnipseln ---
  for (const name of ["ueber", "impressum", "datenschutz"]) {
    const quelle = path.join(SEITEN_ORDNER, `${name}.html`);
    if (fs.existsSync(quelle)) {
      const inhalt = `<div class="karte">${fs.readFileSync(quelle, "utf8")}</div>`;
      const titel = name.charAt(0).toUpperCase() + name.slice(1);
      fs.writeFileSync(path.join(ZIEL, `${name}.html`), seite(titel, inhalt, 0));
    }
  }

  // --- Eigener RSS-Feed (die neuesten 30) ---
  const feedItems = posts.slice(0, 30).map(function (post) {
    return `  <item>
    <title>${htmlSichern(post.titel)}</title>
    <link>${BLOG_URL}/posts/${post.slug}.html</link>
    <guid>${BLOG_URL}/posts/${post.slug}.html</guid>
    <pubDate>${new Date(post.datum).toUTCString()}</pubDate>
    <description>${htmlSichern(post.text.slice(0, 300))}</description>
  </item>`;
  }).join("\n");
  fs.writeFileSync(path.join(ZIEL, "feed.xml"),
`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${BLOG_NAME}</title>
  <link>${BLOG_URL}</link>
  <description>${BLOG_CLAIM}</description>
  <language>de</language>
${feedItems}
</channel></rss>`);

  console.log(`[build] Seite gebaut: ${posts.length} Posts -> site/`);
}

// Direktaufruf (node build.mjs) — als Modul-Import baut lauf.mjs selbst.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  seiteBauen();
}
