/*
  schreiben.mjs — Stufe 3+4: der Writer und das Fakten-Gate.

  Glaubwuerdigkeits-Architektur (siehe KONZEPT.md):
    - Der Writer bekommt NUR Titel + Teaser der Quelle und darf NUR daraus
      zusammenfassen. Eigenes Modell-Wissen ist per Prompt verboten.
    - Das Fakten-Gate ist ein ZWEITER, unabhaengiger Aufruf, der den Entwurf
      Satz fuer Satz gegen das Quellmaterial haelt. Nicht gedeckt = verworfen.
    - Beide Stufen antworten in striktem JSON. Ist das JSON kaputt -> verwerfen
      (skip-on-doubt), niemals raten.

  Es gibt bewusst KEINE Reparatur-Logik ("dann nehmen wir den Satz halb") —
  jede Schlauheit hier ist ein Einfallstor fuer Fehler.
*/

// GitHub Models: kostenloses LLM-Kontingent, das in GitHub Actions direkt mit
// dem automatischen GITHUB_TOKEN funktioniert — kein eigener API-Account noetig.
// Gratis-Limit (Stand 07/2026): ~150 Anfragen/Tag fuer kleine Modelle; unsere
// Obergrenze liegt bei 48/Tag (6 Posts x 2 Aufrufe x 4 Laeufe).
const MODELL = "openai/gpt-4o-mini";
const API_URL = "https://models.github.ai/inference/chat/completions";

// Serien, die der Writer vergeben darf — alles andere wird "Sonstiges".
// Haelt die Badges auf der Seite konsistent.
const ERLAUBTE_SERIEN = [
  "F1", "F2", "F3", "F4", "WEC", "IMSA", "ELMS", "Le Mans", "DTM", "GT Masters",
  "GT World Challenge", "GT4", "Porsche Cup", "NLS", "RCN", "24h Nuerburgring",
  "Time Attack", "iRacing", "Le Mans Ultimate", "Assetto Corsa", "ACC", "Sonstiges"
];

// ---------------------------------------------------------------------------
// Gemeinsamer API-Aufruf. Kein SDK — ein simpler fetch reicht und haelt
// die Dependency-Liste kurz. Format: OpenAI-kompatibel (so spricht GitHub Models).
// ---------------------------------------------------------------------------

// Eigener Fehlertyp fuers Tageslimit: den soll lauf.mjs erkennen und den
// Lauf sauber beenden statt sinnlos weiterzuprobieren.
export class RateLimitFehler extends Error {}

async function llmFragen(systemPrompt, userPrompt, maxTokens) {
  const antwort = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${process.env.GITHUB_TOKEN}`
    },
    body: JSON.stringify({
      model: MODELL,
      max_tokens: maxTokens,
      temperature: 0.2,          // niedrig: wir wollen Treue, keine Kreativitaet
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (antwort.status === 429) {
    throw new RateLimitFehler("Gratis-Kontingent von GitHub Models erschoepft (429)");
  }
  if (!antwort.ok) {
    throw new Error(`API-Fehler ${antwort.status}: ${(await antwort.text()).slice(0, 200)}`);
  }

  const daten = await antwort.json();
  return daten.choices?.[0]?.message?.content || "";
}

// JSON aus einer Modell-Antwort ziehen. Modelle packen gern ```json-Zaeune
// drumherum — die schneiden wir weg. Scheitert das Parsen: null (= verwerfen).
function jsonAusAntwort(text) {
  const bereinigt = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    return JSON.parse(bereinigt);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stufe 3: der Writer.
// ---------------------------------------------------------------------------

const WRITER_SYSTEM = `Du bist Kurator eines deutschsprachigen Motorsport- und Simracing-Newsblogs.
Du fasst EINEN Quellartikel als kurzen deutschen Nachrichtenpost zusammen.

EISERNE REGELN:
1. Verwende AUSSCHLIESSLICH Informationen aus dem gelieferten Quellmaterial (Titel + Teaser). Dein eigenes Wissen ueber Motorsport ist fuer Fakten TABU - keine Namen, Zahlen, Ergebnisse oder Hintergruende ergaenzen, die nicht im Material stehen.
2. Wenn das Material zu duenn fuer einen sinnvollen Post ist (unter ~3 belastbaren Aussagen), antworte exakt: {"verwerfen": true}
3. Keine Spekulation, keine Meinung, keine Superlative. Nuechterner, klarer Nachrichtenstil.
4. Uebersetze englisches Material sinngetreu ins Deutsche.
5. Antworte NUR mit einem JSON-Objekt, ohne Text davor oder danach:
{"titel": "...", "serie": "...", "text": "..."}
- titel: praegnant, max 80 Zeichen, deutsch
- serie: genau einer dieser Werte: ${ERLAUBTE_SERIEN.join(", ")}
- text: 80-180 Woerter, deutsch, 1-2 Absaetze (Absaetze mit \\n\\n getrennt). Struktur: Was ist passiert -> relevante Details aus der Quelle.`;

export async function postSchreiben(artikel) {
  // Zu duennes Material gar nicht erst zum LLM schicken (spart Geld + Fehler).
  if (artikel.teaser.length < 120) return null;

  const userPrompt = `QUELLMATERIAL
Quelle: ${artikel.quelle.name} (Sprache: ${artikel.quelle.sprache})
Datum: ${artikel.datum}
Titel: ${artikel.titel}
Teaser: ${artikel.teaser}`;

  const antwort = await llmFragen(WRITER_SYSTEM, userPrompt, 800);
  const entwurf = jsonAusAntwort(antwort);

  if (!entwurf || entwurf.verwerfen) return null;
  if (!entwurf.titel || !entwurf.text) return null;
  if (!ERLAUBTE_SERIEN.includes(entwurf.serie)) entwurf.serie = "Sonstiges";
  return entwurf;
}

// ---------------------------------------------------------------------------
// Stufe 4: das Fakten-Gate.
// ---------------------------------------------------------------------------

const GATE_SYSTEM = `Du bist ein strenger Faktenpruefer. Du bekommst QUELLMATERIAL und einen daraus angeblich zusammengefassten ENTWURF.

Pruefe jede Tatsachenbehauptung des Entwurfs (Namen, Zahlen, Ergebnisse, Orte, Zeitpunkte, Zitate):
Ist sie durch das Quellmaterial gedeckt? Sinngemaesse Uebersetzung aus dem Englischen ist ok. Jede Information, die NICHT im Quellmaterial steht, ist ein Fehler - egal ob sie zufaellig stimmt.

Antworte NUR mit einem JSON-Objekt:
{"urteil": "ok"} wenn ALLE Aussagen gedeckt sind, sonst
{"urteil": "verwerfen", "begruendung": "kurzer Grund"}

Im Zweifel: verwerfen.`;

export async function faktenGate(artikel, entwurf) {
  const userPrompt = `QUELLMATERIAL
Titel: ${artikel.titel}
Teaser: ${artikel.teaser}

ENTWURF
Titel: ${entwurf.titel}
Text: ${entwurf.text}`;

  const antwort = await llmFragen(GATE_SYSTEM, userPrompt, 300);
  const urteil = jsonAusAntwort(antwort);

  // Kaputtes JSON oder fehlendes Urteil = verwerfen, niemals durchwinken.
  if (!urteil || urteil.urteil !== "ok") {
    return { urteil: "verwerfen", begruendung: urteil?.begruendung || "Pruefantwort unlesbar" };
  }
  return { urteil: "ok" };
}
