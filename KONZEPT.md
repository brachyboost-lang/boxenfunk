# Motorsport-Newsblog — Konzept & Architektur (Wette 3, Lotterieschein)

> Automatischer deutschsprachiger Newsblog + Newsletter für Motorsport
> (F1 bis RCN) und Simracing (iRacing, Le Mans Ultimate, Assetto-Corsa-Familie).
> Ziel: läuft von allein, Alex legt nur zur Wartung Hand an.
> Rolle im Geld-Plan: Lotterieschein — billig, zeitlich begrenzt, Chance klein,
> Decke hoch. (Strategie-Kontext liegt im privaten Planungs-Repo.)

## Die Nische (warum das kein „noch ein F1-Blog" ist)

Die Kreuzung aus drei Dingen, die kaum jemand zusammen abdeckt:

1. **Deutschsprachig** — F1-News gibt es überall, aber NLS, RCN, GT Masters,
   Time Attack Masters sind deutsche/DACH-Themen mit dünner, verstreuter Abdeckung.
2. **Auch die „kleinen Brüder"** — F2/F3/F4, Porsche Cup, GT4: Fans dieser Serien
   werden von den großen Portalen nur nebenbei bedient.
3. **Echter Motorsport × Simracing in EINEM Medium** — iRacing-Specials
   (Daytona 24, Bathurst, Nürburgring), LMU-Updates, AC-Evo-News neben den
   echten Rennwochenenden. Die Zielgruppen überlappen zu ~80 %, die Medien nicht.

Zielgruppe: DACH-Simracer und Motorsport-Nerds, die mehr als F1 schauen.

## Das Glaubwürdigkeits-Problem (Kernentscheidung der Architektur)

„Vollautomatisch" + „faktisch höchstglaubwürdig" geht NUR mit dieser Regel:

> **Das System ist Kurator, nicht Reporter. Es erfindet nie Inhalte.**

Konkret heißt das:

1. **Quellen-Whitelist:** Es wird ausschließlich aus definierten, seriösen
   Quellen (offizielle Serien-Seiten, etablierte Fachmedien, offizielle
   Sim-Publisher) gelesen. Kein freies Web, keine Social-Media-Gerüchte.
2. **Grounded Writing:** Das LLM bekommt NUR den Quelltext und darf NUR
   zusammenfassen, was drinsteht. Modell-Wissen ist tabu (Prompt-Regel +
   niedrige Temperatur). Fehlt Substanz → Artikel wird übersprungen, nicht
   aufgefüllt.
3. **Fakten-Gate (zweiter LLM-Durchlauf):** Jeder generierte Satz wird gegen
   den Quelltext geprüft („Ist diese Aussage durch die Quelle gedeckt?").
   Ein nicht gedeckter Satz → Post wird verworfen oder der Satz gestrichen.
   Lieber kein Post als ein falscher.
4. **Quellen-Pflicht sichtbar:** Jeder Post endet mit „Quellen:"-Block und
   Links. Größere Behauptungen (Strafen, Wechsel, Absagen) brauchen entweder
   eine offizielle Quelle oder Zuschreibung im Text („laut Motorsport-Total").
5. **Transparenz:** Impressum/About sagt offen, dass die Beiträge automatisch
   kuratierte Zusammenfassungen sind. Das schützt die Glaubwürdigkeit, statt
   ihr zu schaden — der Wert ist die Auswahl und Bündelung, nicht die Illusion
   einer Redaktion.
6. **Skip-on-doubt als Default:** Jede Stufe der Pipeline darf verwerfen.
   Ein leerer Tag ist okay. Ein erfundenes Ergebnis ist das Ende des Projekts.

## Architektur (Pipeline)

```
[1 Collector] --> [2 Dedupe/Cluster] --> [3 Relevanz-Filter]
      |                                        |
   (RSS/Atom,                                  v
   alle 4-6 h)                          [4 Writer (LLM)]
                                               |
                                               v
                                        [5 Fakten-Gate (LLM)]
                                               |
                                   verworfen <-+-> bestanden
                                               |
                                               v
                                    [6 Publisher: Markdown-Post
                                     -> git commit -> GitHub Pages]
                                               |
                                               v
                                  [7 Newsletter: Wochen-Digest
                                     aus den Posts der Woche]

              [8 Health-Monitor: täglicher Check, Mail an Alex bei Problemen]
```

### Stufen im Detail

1. **Collector** — GitHub-Actions-Cron (alle 4–6 h): RSS/Atom-Feeds der
   Whitelist abrufen, neue Einträge samt Volltext/Teaser speichern (JSON im Repo).
2. **Dedupe/Cluster** — gleiche Story aus mehreren Quellen erkennen
   (Titel-Ähnlichkeit + Datum) und zu einem Themen-Cluster bündeln.
   Mehrere Quellen pro Story = besser fürs Fakten-Gate.
3. **Relevanz-Filter** — Keyword-/Serien-Whitelist (siehe Ressorts). Was nicht
   passt, fliegt raus. Spart LLM-Kosten und hält den Blog scharf.
4. **Writer** — LLM via GitHub Models (Gratis-Kontingent, kleines Modell reicht):
   pro Cluster ein deutscher Kurzpost (150–300 Wörter) nach festem Template:
   Was ist passiert / Kontext / Warum relevant / Quellen. Nur aus Quelltext.
5. **Fakten-Gate** — zweiter, unabhängiger Prompt: Satz-für-Satz-Abgleich
   gegen die Quelltexte. Ausgabe: bestanden / Satz streichen / verwerfen.
6. **Publisher** — Markdown-Datei mit Frontmatter (Datum, Ressort, Serie,
   Quellen) ins Repo committen; statischer Site-Generator (Eleventy) baut den
   Blog; GitHub Pages deployt am Ende jedes Workflow-Laufs (kostenlos, ohne Limits).
7. **Newsletter** — 1×/Woche (So-Abend oder Mo-Früh): Digest aus den Posts der
   Woche, gruppiert nach Ressort, via Buttondown-API (Free-Tier bis 100 Abos,
   Double-Opt-in eingebaut). Blog zuerst, Newsletter ab den ersten Lesern.
8. **Health-Monitor** — täglicher Job: tote Feeds, Pipeline-Fehler,
   „0 Posts seit 48 h"-Warnung → Mail an Alex. DAS ist die Wartungsschnittstelle.

### Ressorts / Quellen-Whitelist (Startaufstellung)

| Ressort | Serien | Quellen-Kandidaten (RSS prüfen!) |
|---|---|---|
| Formel | F1, F2, F3, F4 | formula1.com, motorsport-total.com, formel1.de, Auto Motor Sport |
| Langstrecke | WEC, IMSA, Le Mans | sportscar365, dailysportscar, fiawec.com, imsa.com |
| GT & DTM | DTM, GT Masters, GT4, Porsche Cup | adac-motorsport.de, dtm.com, GT-Place |
| Nordschleife | NLS, RCN, 24h | nls.de, vln.de-Nachfolger, 24h-rennen.de, Pitwalk/Insider |
| Time Attack | German TAM | Offizielle Seite + Social (dünnste Quelle, ggf. später) |
| Simracing | iRacing (+Specials), LMU, AC/ACC/AC Evo | iracing.com/news, OverTake (RaceDepartment), Studio-397/MSG, Kunos-Blog, boxthislap |

> Erster Bau-Schritt ist ein **Feed-Audit**: welche dieser Quellen haben
> brauchbare RSS-Feeds / saubere HTML-Struktur? Die Whitelist lebt in einer
> `quellen.json` — neue Quelle eintragen = eine Zeile, kein Code.

## Rechtliches (nicht optional)

- **Urheberrecht / Leistungsschutzrecht:** NIE Artikel kopieren. Eigene, kurze
  Zusammenfassung in eigenen Worten + Link zur Quelle ist der sichere Rahmen.
  Keine fremden Fotos! (Größtes Abmahn-Risiko im Motorsport.) Start: eigene
  einfache Grafik-Kacheln pro Ressort, keine Rennfotos.
- **Impressum + Datenschutzerklärung** auf dem Blog (deutsche Seite = Pflicht).
- **Newsletter:** Double-Opt-in (macht Buttondown), Abmelde-Link, kein Kauf
  von Adressen. DSGVO-Hinweis in der Datenschutzerklärung.
- **Transparenz über Automatisierung** im About/Impressum (siehe oben).

## Kosten & Betrieb

| Posten | Kosten |
|---|---|
| Hosting (GitHub Pages, statisch) | 0 € |
| Pipeline (GitHub Actions, public/free Kontingent) | 0 € |
| Newsletter (Buttondown Free bis 100 Abos) | 0 € |
| LLM (GitHub Models, Gratis-Kontingent via Workflow-Token) | 0 € |
| Domain (optional, ab Traktion) | ~10 €/Jahr |

**Wartung (realistisches Versprechen):** ~30–60 Min/Woche — Health-Mails
checken, 2–3 Posts stichprobenartig gegenlesen, ab und zu eine Quelle
nachjustieren. „Null Wartung" gibt es nicht; „nur Wartung" ist erreichbar.

## Monetarisierung (erst ab Traktion, Reihenfolge)

1. **Affiliate Sim-Hardware** — Wheels, Pedale, Rigs, Monitore (Amazon u. a.).
   Der natürlichste Fit: Simracing-Leser kaufen Hardware.
2. **Newsletter-Sponsoring** — ab ein paar hundert Abos für Nischen-Anbieter
   (Sim-Shops, Teams, Ligen) interessant.
3. **Ads** erst spät — bei Nischen-Traffic kaum der Rede wert.

## Validierung & Abbruchkriterium (Lotterieschein-Regel!)

- **Bau-Budget:** max. ~2 Wochenenden bis zur laufenden v1. Danach nur Wartung.
- **Distribution seeden:** Posts in passenden Communities teilen (r/simracing-
  Umfeld, deutsche Simracing-Discords, Foren) — Aggregator-Charakter offen
  kommunizieren.
- **Signal nach 30–60 Tagen:** wiederkehrende Besucher, erste organische
  Newsletter-Abos oder Community-Reaktionen → weiterbetreiben und ausbauen.
- **Kein Signal:** Pipeline stilllegen (kostet dann 0 €), Gelerntes
  (Actions/Cron, RSS, LLM-Pipelines, statischer Blog) wandert in den Skill-Stack.
  NICHT monatelang nachlegen — das ist die Lotterieschein-Regel.

## Bauphasen

1. **Feed-Audit** — Quellen-Whitelist real prüfen, `quellen.json` anlegen
2. **Blog-Gerüst** — statischer Generator + GitHub Pages, Ressort-Struktur, Impressum/Datenschutz,
   3 handgebaute Beispiel-Posts als Design-Vorlage
3. **Pipeline v1** — Collector + Filter + Writer + Fakten-Gate + Publisher
   als GitHub Action; 1 Woche im Schatten laufen lassen und Output GEGENLESEN
4. **Go-Live** — Auto-Publish an, Distribution seeden
5. **Newsletter** — Wochen-Digest dazu, sobald der Blog steht
6. **Health-Monitor** — Warn-Mails, dann Hände weg bis auf Wartung

**Arbeitsteilung:** Anders als beim Hirn-Ausleerer (Lern-Projekt) darf Claude
hier den Großteil bauen — der Lotterieschein soll billig sein, auch in Zeit.
Alex versteht die Architektur (dieses Dokument) und übernimmt die Wartung;
Lern-Tiefe holt er sich bei Wette 2.

## Offene Entscheidungen

- [ ] Name + Domain (deutsch, merkbar; Arbeitstitel offen)
- [ ] Start-Ressorts: alle sechs sofort oder erst 3 (Formel/Langstrecke/Simracing)
      und dann erweitern? (Empfehlung: mit 3–4 starten, Quellen-Qualität schlägt Breite)
- [ ] Startzeitpunkt: Empfehlung NACH Hirn-Ausleerer v0.2, damit Wette 2
      nicht das Momentum verliert
