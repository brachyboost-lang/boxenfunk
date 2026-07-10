/*
  sammeln.mjs — Stufe 1+2 der Pipeline: Feeds abrufen, filtern, deduplizieren.

  Liefert "Kandidaten": neue, relevante Artikel samt Quelltext-Schnipsel.
  Was hier NICHT durchkommt, kostet spaeter auch kein LLM-Geld.
*/

import fs from "node:fs";
import path from "node:path";
import Parser from "rss-parser";

// Artikel aelter als 36 h ignorieren wir: der Blog soll aktuell sein,
// und beim allerersten Lauf wuerden sonst hunderte Altmeldungen durchrauschen.
const MAX_ALTER_STUNDEN = 36;

// Gedaechtnis-Eintraege aelter als 14 Tage werden geloescht, damit die
// Datei nicht endlos waechst. Aeltere Artikel scheitern eh am Altersfilter.
const GEDAECHTNIS_TAGE = 14;

// Browser-Kennung statt Bot-Kennung: manche Portale (z. B. motorsport.com)
// kappen Verbindungen von unbekannten Bots kommentarlos.
const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" }
});

// ---------------------------------------------------------------------------
// Gedaechtnis (daten/gesehen.json): welche Artikel-GUIDs kennen wir schon?
// ---------------------------------------------------------------------------

export function gesehenLaden(wurzel) {
  const datei = path.join(wurzel, "daten", "gesehen.json");
  if (!fs.existsSync(datei)) return { eintraege: {} };
  try {
    return JSON.parse(fs.readFileSync(datei, "utf8"));
  } catch {
    // Kaputte Datei: lieber frisch anfangen (schlimmstenfalls ein paar
    // Dubletten) als die ganze Pipeline sterben lassen.
    return { eintraege: {} };
  }
}

export function gesehenSpeichern(wurzel, gesehen) {
  const grenze = Date.now() - GEDAECHTNIS_TAGE * 24 * 3600 * 1000;
  for (const [guid, eintrag] of Object.entries(gesehen.eintraege)) {
    if (new Date(eintrag.datum).getTime() < grenze) delete gesehen.eintraege[guid];
  }
  const ordner = path.join(wurzel, "daten");
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(path.join(ordner, "gesehen.json"), JSON.stringify(gesehen, null, 2));
}

// ---------------------------------------------------------------------------
// Dubletten-Erkennung ueber normalisierte Titel.
// "Verstappen gewinnt in Spa!" und "Verstappen gewinnt in Spa" sollen als
// dieselbe Story gelten — auch wenn sie aus zwei Quellen kommen.
// ---------------------------------------------------------------------------

export function titelNormalisieren(titel) {
  return (titel || "")
    .toLowerCase()
    .replace(/[^a-zäöüß0-9 ]/g, " ")
    .split(/\s+/)
    .filter(function (wort) { return wort.length > 3; })  // Fuellwoerter raus
    .sort()
    .join(" ");
}

// Jaccard-Aehnlichkeit zweier Wortmengen: |Schnitt| / |Vereinigung|.
// 1.0 = identisch, 0.0 = kein gemeinsames Wort. Ab 0.5 gilt: gleiche Story.
export function titelAehnlichkeit(normA, normB) {
  const a = new Set(normA.split(" ").filter(Boolean));
  const b = new Set(normB.split(" ").filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  let schnitt = 0;
  for (const wort of a) if (b.has(wort)) schnitt++;
  return schnitt / (a.size + b.size - schnitt);
}

// Liefert den Schluessel des Treffers (z. B. "post:2026-07-08-...") oder null.
// Wichtig fuer Quellen-Updates: trifft eine neue Meldung auf einen BESTEHENDEN
// Post (post:-Eintrag), wird sie nicht weggeworfen, sondern als zusaetzliche
// Quelle an den Post gehaengt (bis das Gedaechtnis nach 14 Tagen vergisst).
function dubletteFinden(titelNorm, gesehen, bisherigeKandidaten) {
  for (const [schluessel, eintrag] of Object.entries(gesehen.eintraege)) {
    if (titelAehnlichkeit(titelNorm, eintrag.titelNorm || "") >= 0.5) return schluessel;
  }
  for (const kandidat of bisherigeKandidaten) {
    if (titelAehnlichkeit(titelNorm, kandidat.titelNorm) >= 0.5) return "kandidat";
  }
  return null;
}

// Meta-Content ist keine Nachricht: Podcasts, Foto-Galerien, Video-Hinweise
// bestehen groesstenteils aus Eigenwerbung. Raus damit, bevor sie LLM kosten.
const TITEL_BLOCKLISTE = [
  "podcast", "fotostrecke", "foto-galerie", "gallery", "galerie:",
  "video:", "watch ", "watch:", "livestream", "live blog", "liveticker"
];

function istMetaContent(titel) {
  const klein = titel.toLowerCase();
  return TITEL_BLOCKLISTE.some(function (wort) { return klein.includes(wort); });
}

// HTML-Reste aus Feed-Teasern entfernen — der Writer soll reinen Text sehen.
function htmlEntfernen(text) {
  return (text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Hauptfunktion: alle Quellen abklappern.
// ---------------------------------------------------------------------------

export async function artikelSammeln(quellen, gesehen) {
  const kandidaten = [];
  const quellenUpdates = [];
  const altersgrenze = Date.now() - MAX_ALTER_STUNDEN * 3600 * 1000;

  for (const quelle of quellen) {
    let feed;
    try {
      feed = await parser.parseURL(quelle.url);
    } catch (fehler) {
      // Ein toter Feed ist Alltag (Drosselung, Wartung) — melden, weitermachen.
      console.warn(`[sammeln] Feed nicht erreichbar: ${quelle.name} (${fehler.message})`);
      continue;
    }

    for (const item of feed.items || []) {
      const guid = item.guid || item.link || item.title;
      if (!guid || gesehen.eintraege[guid]) continue;

      const datum = item.isoDate ? new Date(item.isoDate).getTime() : Date.now();
      if (datum < altersgrenze) continue;

      const teaser = htmlEntfernen(item.contentSnippet || item.content || item.summary || "");
      const titel = htmlEntfernen(item.title || "");
      if (!titel || istMetaContent(titel)) continue;

      // Stichwort-Filter fuer breite Feeds (nur wenn konfiguriert).
      if (quelle.stichwoerter) {
        const heuhaufen = (titel + " " + teaser).toLowerCase();
        const treffer = quelle.stichwoerter.some(function (wort) {
          return heuhaufen.includes(wort.toLowerCase());
        });
        if (!treffer) continue;
      }

      const titelNorm = titelNormalisieren(titel);
      const treffer = dubletteFinden(titelNorm, gesehen, kandidaten);
      if (treffer) {
        // Schon bekannt (andere Quelle/aehnlicher Titel) — als gesehen merken,
        // damit sie nicht bei jedem Lauf erneut geprueft wird.
        gesehen.eintraege[guid] = { titelNorm, datum: new Date().toISOString() };
        // Trifft sie einen veroeffentlichten Post: als Zusatzquelle vormerken.
        if (treffer.startsWith("post:") && item.link) {
          quellenUpdates.push({ slug: treffer.slice(5), quellenName: quelle.name, url: item.link });
        }
        continue;
      }

      kandidaten.push({
        guid,
        titel,
        titelNorm,
        teaser: teaser.slice(0, 1500),   // Deckel: mehr braucht der Writer nicht
        link: item.link || "",
        datum: item.isoDate || new Date().toISOString(),
        quelle
      });
    }
  }

  // Neueste zuerst — wenn der Kostendeckel greift, gewinnen die frischesten.
  kandidaten.sort(function (a, b) { return new Date(b.datum) - new Date(a.datum); });
  return { kandidaten, quellenUpdates };
}

// ---------------------------------------------------------------------------
// Artikel-Volltext holen: Feed-Teaser sind oft duenn (2-3 Saetze). Fuer
// gehaltvolle Posts laden wir die Artikelseite und ziehen den Haupttext raus.
// Heuristik statt Perfektion: <article>-Bereich bevorzugen, sonst ganze Seite,
// dann alle laengeren <p>-Absaetze einsammeln. Scheitert das (Paywall,
// Bot-Schutz, Timeout): leer zurueck — der Writer arbeitet dann mit dem Teaser.
// ---------------------------------------------------------------------------

export async function volltextHolen(url) {
  if (!url) return "";
  try {
    const antwort = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000)
    });
    if (!antwort.ok) return "";
    const html = await antwort.text();

    let bereich = (html.match(/<article[\s\S]*?<\/article>/i) || [html])[0];
    bereich = bereich
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "");

    const absaetze = [...bereich.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(function (m) { return htmlEntfernen(m[1]); })
      .filter(function (t) { return t.length > 60; });   // Menue-/Footer-Kram raus

    return absaetze.join("\n").slice(0, 4000);   // Deckel: haelt Prompts bezahlbar
  } catch {
    return "";
  }
}
