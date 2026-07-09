# Boxenfunk — Betriebs-Handbuch

> Automatisch kuratierter Motorsport-/Simracing-Newsblog. Konzept & Architektur:
> `KONZEPT.md`. Dieses Dokument ist das Handbuch für Betrieb und Wartung.

## Wie es läuft (Überblick)

- **GitHub Action** (`.github/workflows/newsblog.yml`) läuft 4× täglich:
  Feeds lesen → Posts schreiben (LLM) → Fakten-Gate → `posts/*.json` +
  neu gebaute `site/` committen.
- **GitHub Pages** deployt `site/` am Ende jedes Laufs (eigener `pages`-Job im
  Workflow — kostenlos, keine Deploy-Limits). Adresse:
  https://brachyboost-lang.github.io/boxenfunk/
- Läuft nur auf dem **main-Branch** (GitHub führt Cron-Workflows nur dort aus).

## Einmalige Einrichtung (Checkliste)

- [x] **LLM: nichts einzurichten.** Die Pipeline nutzt GitHub Models (kostenlos)
      über den automatischen `GITHUB_TOKEN` des Workflows — kein API-Key,
      kein Secret, keine Kosten. Gratis-Limit ~150 Anfragen/Tag; Bedarf max. 48.
- [ ] **GitHub Pages aktivieren:** Repo → Settings → Pages → Source auf
      **"GitHub Actions"** stellen. (Der Workflow versucht das auch selbst;
      schlägt der `pages`-Job beim ersten Mal fehl, diesen Schalter prüfen.)
      Kein Netlify mehr — dessen Free-Deploys sind begrenzt.
- [ ] **Impressum + Datenschutz ausfüllen:** `seiten/impressum.html` und
      `seiten/datenschutz.html` — die `[PLATZHALTER]` ersetzen. **Vorher nicht
      öffentlich verlinken/bewerben!**
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

## Noch offen (bewusst nicht in v1)

- Newsletter (Wochen-Digest via Buttondown) — kommt ab den ersten Lesern
- Ressort-Filterseiten, Archiv-Seiten
- Feeds für NLS/RCN/GT Masters/Time Attack (keine RSS gefunden, siehe
  `quellen.json` → `_todo_keine_feeds_gefunden`)
