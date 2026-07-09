/*
  lauf.mjs — der Orchestrator der Newsblog-Pipeline.

  Ablauf eines Laufs (siehe KONZEPT.md):
    1. Quellen-Whitelist laden (quellen.json)
    2. Feeds abrufen, neue + relevante Artikel einsammeln   -> sammeln.mjs
    3. Pro Artikel: deutschen Kurzpost schreiben (LLM)      -> schreiben.mjs
    4. Fakten-Gate: Post gegen Quelltext pruefen (LLM)      -> schreiben.mjs
    5. Bestandene Posts als JSON nach posts/ legen
    6. Statische Seite neu bauen                            -> ../build.mjs

  Grundregel ueberall: skip-on-doubt. Jede Stufe darf verwerfen.
  Ein leerer Lauf ist ok, ein falscher Post nicht.

  Aufruf:
    node pipeline/lauf.mjs               kompletter Lauf (braucht ANTHROPIC_API_KEY)
    node pipeline/lauf.mjs --nur-sammeln nur Feeds testen, nichts schreiben (kein Key noetig)
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artikelSammeln, gesehenLaden, gesehenSpeichern, titelNormalisieren } from "./sammeln.mjs";
import { postSchreiben, faktenGate, RateLimitFehler } from "./schreiben.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.join(HIER, "..");
const POSTS_ORDNER = path.join(WURZEL, "posts");

// Kostendeckel: mehr Posts pro Lauf gibt es nicht, egal wie viel Neues da ist.
// Bei Cron alle 6 h sind das maximal ~24 Posts am Tag — real deutlich weniger.
const MAX_POSTS_PRO_LAUF = 6;

const nurSammeln = process.argv.includes("--nur-sammeln");

function slugErzeugen(titel) {
  return titel
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function main() {
  const quellenDatei = JSON.parse(fs.readFileSync(path.join(WURZEL, "quellen.json"), "utf8"));
  const gesehen = gesehenLaden(WURZEL);

  console.log(`[lauf] ${quellenDatei.quellen.length} Quellen, ${Object.keys(gesehen.eintraege).length} bekannte Artikel im Gedaechtnis`);

  // ---- Stufe 1+2: sammeln, filtern, deduplizieren --------------------------
  const kandidaten = await artikelSammeln(quellenDatei.quellen, gesehen);
  console.log(`[lauf] ${kandidaten.length} neue relevante Artikel gefunden`);

  if (nurSammeln) {
    for (const k of kandidaten) {
      console.log(`  - [${k.quelle.ressort}] ${k.titel}  (${k.quelle.name})`);
    }
    console.log("[lauf] --nur-sammeln: Ende ohne LLM-Aufrufe. Gedaechtnis wird NICHT aktualisiert.");
    return;
  }

  // In GitHub Actions ist GITHUB_TOKEN automatisch da (der Workflow reicht ihn
  // durch). Lokal: GITHUB_TOKEN=$(gh auth token) setzen, siehe README.
  if (!process.env.GITHUB_TOKEN) {
    console.error("[lauf] FEHLER: GITHUB_TOKEN fehlt. Abbruch, bevor Artikel als gesehen markiert werden.");
    process.exit(1);
  }

  // ---- Stufe 3+4: schreiben und pruefen ------------------------------------
  const auswahl = kandidaten.slice(0, MAX_POSTS_PRO_LAUF);
  let veroeffentlicht = 0;
  let verworfen = 0;

  for (const artikel of auswahl) {
    const kennung = `${artikel.quelle.name}: ${artikel.titel}`;
    try {
      const entwurf = await postSchreiben(artikel);
      if (!entwurf) {
        console.log(`[writer] verworfen (zu duenn/kein JSON): ${kennung}`);
        verworfen++;
        continue;
      }

      const urteil = await faktenGate(artikel, entwurf);
      if (urteil.urteil !== "ok") {
        console.log(`[gate] VERWORFEN (${urteil.begruendung || "nicht gedeckt"}): ${kennung}`);
        verworfen++;
        continue;
      }

      // Post speichern. Dateiname = Datum + Slug -> stabil, sortierbar, lesbar.
      const datum = new Date().toISOString();
      const slug = `${datum.slice(0, 10)}-${slugErzeugen(entwurf.titel)}`;
      const post = {
        titel: entwurf.titel,
        datum,
        ressort: artikel.quelle.ressort,
        serie: entwurf.serie,
        text: entwurf.text,
        quellen: [{ name: artikel.quelle.name, url: artikel.link }]
      };
      fs.mkdirSync(POSTS_ORDNER, { recursive: true });
      fs.writeFileSync(path.join(POSTS_ORDNER, `${slug}.json`), JSON.stringify(post, null, 2));
      console.log(`[lauf] VEROEFFENTLICHT: ${entwurf.titel}`);
      veroeffentlicht++;

      // Titel des fertigen Posts auch als Dublette merken, damit dieselbe
      // Story aus einer zweiten Quelle nicht nochmal erscheint.
      gesehen.eintraege[`post:${slug}`] = { titelNorm: titelNormalisieren(artikel.titel), datum };
    } catch (fehler) {
      if (fehler instanceof RateLimitFehler) {
        // Tageslimit erreicht: Lauf sauber beenden, bisher fertige Posts behalten.
        console.warn(`[lauf] ${fehler.message} — Rest des Laufs uebersprungen.`);
        break;
      }
      // Ein kaputter Artikel darf nicht den ganzen Lauf reissen.
      console.error(`[lauf] Fehler bei "${kennung}": ${fehler.message} — uebersprungen.`);
      verworfen++;
    }
  }

  // ---- Gedaechtnis speichern ------------------------------------------------
  // Alle gesichteten Artikel gelten als erledigt (auch verworfene: nicht
  // nochmal versuchen, sonst zahlen wir jeden Lauf erneut dafuer).
  for (const artikel of kandidaten) {
    gesehen.eintraege[artikel.guid] = {
      titelNorm: titelNormalisieren(artikel.titel),
      datum: new Date().toISOString()
    };
  }
  gesehenSpeichern(WURZEL, gesehen);

  // Hinweis: Kandidaten jenseits des Kostendeckels werden NICHT vertagt,
  // sondern uebersprungen — beim naechsten Lauf gibt es frischere News.
  console.log(`[lauf] Fertig: ${veroeffentlicht} veroeffentlicht, ${verworfen} verworfen, ${kandidaten.length - auswahl.length} wegen Kostendeckel uebersprungen`);

  // ---- Stufe 6: Seite neu bauen ---------------------------------------------
  if (veroeffentlicht > 0) {
    const { seiteBauen } = await import("../build.mjs");
    seiteBauen();
  }
}

main().catch(function (fehler) {
  console.error("[lauf] Abbruch:", fehler);
  process.exit(1);
});
