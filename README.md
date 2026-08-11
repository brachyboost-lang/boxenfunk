# Boxenfunk — Betriebs-Handbuch

> Automatisch kuratierter Motorsport-/Simracing-Newsblog. Konzept & Architektur:
> `KONZEPT.md`. Dieses Dokument ist das Handbuch für Betrieb und Wartung.

## ⛔ Stand 11.08.2026: offline gestellt

Der Blog ist **nicht mehr öffentlich erreichbar**. GitHub Pages wurde deaktiviert
und der Workflow `newsblog` auf `disabled_manually` gesetzt; es erscheinen keine
neuen Beiträge mehr. Die 247 bereits erzeugten Posts liegen unverändert in
`posts/`, der Code ist vollständig — ein Neustart ist jederzeit möglich.

**Grund:** Die Seite lief mit dem unausgefüllten Platzhalter-Impressum online
(siehe Checkliste unten, Punkt „Impressum + Datenschutz ausfüllen"). Eine
öffentlich zugängliche Seite braucht nach § 5 DDG eine ladungsfähige Anschrift;
ein Postfach genügt dafür nicht.

**Vor einem Wiederanschalten zu klären:**

1. **Impressum und Datenschutz ausfüllen** — `seiten/impressum.html` und
   `seiten/datenschutz.html`. Erfordert die Entscheidung, die private Anschrift
   zu veröffentlichen; sie ist danach dauerhaft öffentlich.
2. **Urheberrecht prüfen.** Die Posts entstehen aus bis zu 4000 Zeichen
   Artikel-Volltext der Quellen. Je näher ein Post am Original liegt, desto eher
   ist das eine Bearbeitung fremder Werke statt einer eigenständigen
   Zusammenfassung. Die Whitelist in `quellen.json` besteht aus offiziellen
   Serien-Seiten und Fachmedien.
3. **Schatten-Phase nachholen** (siehe unten) — sie wurde beim ersten Start
   übersprungen.

Reaktivieren geht über `gh workflow enable newsblog` und Settings → Pages →
Source auf „GitHub Actions".

## Wie es läuft (Überblick)

- **GitHub Action** (`.github/workflows/newsblog.yml`) läuft 4× täglich:
  Feeds lesen → Artikel-Volltext holen → Posts schreiben (LLM, mit Tags) →
  Fakten-Gate → `posts/*.json` + neu gebaute `site/` committen.
- **Dubletten dreistufig:** gleicher Feed-Eintrag (GUID), ähnlicher Quelltitel,
  und nach dem Schreiben der deutsche Post-Titel gegen bestehende Posts.
  Trifft eine Meldung einen bestehenden Post (bis 14 Tage zurück), wird ihre
  Quelle an den Post angehängt statt ein Duplikat veröffentlicht.
- **Startseite:** Kategorie-Buttons (Ressorts), Tag-Chips und Suche über
  Titel/Tags/Inhalt — alles clientseitig, kein Server nötig.
- **Substanz-Regel:** Posts unter ~60 Wörtern werden verworfen; der Writer
  bekommt den Artikel-Volltext (bis 4000 Zeichen), nicht nur den Feed-Teaser.
- **GitHub Pages** deployt `site/` am Ende jedes Laufs (eigener `pages`-Job im
  Workflow — kostenlos, keine Deploy-Limits). Adresse:
  https://brachyboost-lang.github.io/boxenfunk/
- Läuft nur auf dem **main-Branch** (GitHub führt Cron-Workflows nur dort aus).

## Einmalige Einrichtung (Checkliste)

- [x] **LLM: nichts einzurichten.** Die Pipeline nutzt GitHub Models (kostenlos)
      über den automatischen `GITHUB_TOKEN` des Workflows — kein API-Key,
      kein Secret, keine Kosten. Gratis-Limit ~150 Anfragen/Tag; Bedarf max. 48.
- [ ] **Impressum + Datenschutz ausfüllen:** `seiten/impressum.html` und
      `seiten/datenschutz.html` — die `[PLATZHALTER]` ersetzen. **Erst danach
      wieder online stellen.** Dieser Punkt wurde beim ersten Start übersehen
      und hat zur Abschaltung geführt.
- [ ] **GitHub Pages aktivieren:** Repo → Settings → Pages → Source auf
      **"GitHub Actions"** stellen. Aktuell deaktiviert — erst nach dem Punkt
      darüber wieder einschalten. Kein Netlify mehr, dessen Free-Deploys sind
      begrenzt.
- [x] **Blog-URL:** in `build.mjs` steht die GitHub-Pages-Adresse; nur bei
      Wechsel auf eine eigene Domain anpassen (wichtig für den RSS-Feed).
- [ ] **Erster manueller Lauf:** GitHub → Actions → newsblog → Run workflow.
      Output GEGENLESEN (Schatten-Phase, siehe unten).

## Schatten-Phase (erste Woche, Pflicht!)

Die erste Woche täglich kurz die neu erschienenen Posts mit der verlinkten
Quelle vergleichen: Stimmen die Fakten? Ist die Übersetzung sauber?
Erst wenn eine Woche lang nichts Falsches durchkam, die Seite aktiv verbreiten.
Fällt etwas Falsches auf: Post-JSON aus `posts/` löschen, `npm run build`,
committen — und den Fall notieren (Prompt-Schärfung).

## Wartung (~30–60 Min/Woche)

- **Fehler-Mails:** GitHub mailt automatisch, wenn der Action-Lauf fehlschlägt.
  Häufigste Ursache: ein Feed dauerhaft tot → in `quellen.json` entfernen
  oder ersetzen. (Einzelne Feed-Ausfälle überlebt die Pipeline still.)
- **Stichprobe:** 2–3 aktuelle Posts gegen ihre Quelle lesen.
- **Leerlauf-Check:** Erscheinen seit >48 h gar keine Posts, obwohl was los ist?
  → Actions-Log ansehen (`[sammeln]`-Warnungen zeigen tote Feeds).

## Lokal arbeiten

```bash
cd Boxenfunk   # Repo-Wurzel
npm install               # einmalig
npm run sammeln-test      # Feeds testen, zeigt Kandidaten, KEIN LLM/Token nötig
npm run build             # Seite aus posts/ neu bauen -> site/
$env:GITHUB_TOKEN=(gh auth token); npm run lauf   # kompletter Lauf (PowerShell)
```

Vorschau: `site/index.html` direkt im Browser oeffnen oder
`py -m http.server 8080` starten und `http://localhost:8080/site/` oeffnen.

## Quelle hinzufügen/entfernen

Nur `quellen.json` editieren — kein Code. Felder: `name`, `url` (RSS/Atom),
`ressort` (`formel` | `langstrecke` | `gt-dtm` | `nordschleife` | `simracing`),
`sprache`, optional `stichwoerter` (Filter für breite Feeds).
Whitelist-Prinzip: nur seriöse Quellen (offizielle Serien-Seiten, etablierte
Fachmedien) — die Glaubwürdigkeit des Blogs hängt an dieser Liste.

## Kosten

- GitHub Pages, GitHub Actions: 0 € (keine Deploy-Limits wie bei Netlify)
- LLM: 0 € — GitHub Models über den Workflow-Token. Pro Post ~2 Aufrufe
  (Writer + Gate), Deckel 6 Posts/Lauf, 4 Läufe/Tag = max. 48 Anfragen bei
  ~150 frei/Tag. Ist das Tageslimit doch mal erschöpft (HTTP 429), beendet
  der Lauf sich sauber und der nächste Cron übernimmt.

## Arbeitsweise

Hier steckt KI an zwei verschiedenen Stellen, die man auseinanderhalten
sollte.

**Im Produkt:** Ein LLM schreibt die Posts aus den Feed-Artikeln. Das ist
der Kern der Idee — und gleichzeitig das Risiko, denn ein Modell, das
Nachrichten formuliert, kann Fakten erfinden. Dagegen läuft mehr als nur
Hoffnung:

- ein **Fakten-Gate** nach dem Schreiben, das den Post gegen den
  Quelltext prüft,
- der Writer bekommt den **Artikel-Volltext** (bis 4000 Zeichen) statt
  nur des Feed-Teasers, weil aus einem Zweizeiler sonst frei erfunden wird,
- eine **Substanz-Regel**, die zu kurze Posts verwirft,
- eine **Whitelist** in `quellen.json`: nur offizielle Serien-Seiten und
  etablierte Fachmedien,
- eine **Schatten-Phase** von einer Woche, in der jeder Post gegen seine
  Quelle gegengelesen wird, bevor die Seite verbreitet wird.

**Beim Bauen:** Die Pipeline selbst ist KI-gestützt entstanden (Claude
Code), die Commit-History weist das aus. Von mir kommen der Zuschnitt der
Ressorts, die Quellenauswahl und die dreistufige Dublettenprüfung — gleicher
Feed-Eintrag, ähnlicher Quelltitel, und nach dem Schreiben noch der
deutsche Titel gegen bestehende Posts, weil dieselbe Meldung sonst über
mehrere Feeds mehrfach erscheint. Trifft eine Meldung einen bestehenden
Post, wird ihre Quelle angehängt statt ein Duplikat veröffentlicht.

Ein Gegenbeispiel ohne KI-Unterstützung ist mein
[Python-Abschlussprojekt](https://github.com/brachyboost-lang/PythonAbschlussProjekt).

## Noch offen (bewusst nicht in v1)

- Newsletter (Wochen-Digest via Buttondown) — kommt ab den ersten Lesern
- Ressort-Filterseiten, Archiv-Seiten
- Feeds für NLS/RCN/GT Masters/Time Attack (keine RSS gefunden, siehe
  `quellen.json` → `_todo_keine_feeds_gefunden`)
