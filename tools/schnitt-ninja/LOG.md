# Schnitt-Ninja – Entwicklungs-Log

Projekt: Fruit-Ninja-Klon für mobile Browser, deutsche UI, GitHub Pages.
Briefing: `schnitt-ninja-briefing-v2.md` (v2)
Live: https://mangenehm.github.io/tools/schnitt-ninja/
Repo-Konvention: ein Ordner unter `tools/` mit `tool.json` + `index.html`; der Index der Startseite wird per GitHub Action (`scripts/generate-index.py`) erzeugt.

---

## 2026-09-07 – M0: Setup

- [x] Briefing gelesen, Repo `mangenehm.github.io` geklont
- [x] Bestehende Struktur analysiert: `tools/<name>/{tool.json,index.html}`, Generator `scripts/generate-index.py`, Workflow `update-index.yml` (triggert auf `tools/*/index.html`)
- [x] Entscheidung: Briefing-Layout (`src/*.js` als ES-Module) innerhalb von `tools/schnitt-ninja/` – kompatibel mit dem Generator, da `tool.json` + `index.html` vorhanden sind
- [x] `tool.json`, `LOG.md`, Ordnerstruktur angelegt

## 2026-09-07 – M1: Core Loop

- [x] `index.html` (alle Screens als DOM-Overlays), `style.css` (mobile-first, Sicherheitsabstände, `prefers-reduced-motion`)
- [x] Festes Design-Raster 390×844, per JS auf die Viewport-Größe skaliert und zentriert (Letterbox); ein einziger gleichmäßiger Maßstab für Rendern **und** Pointer-Koordinaten → Klinge, Trefferprüfung und Schnittkante liegen exakt übereinander
- [x] `entities.js`: Polygon-Werkzeug (Sutherland-Hodgman-Halbebenen-Clip, Schwerpunkt, Fläche, Sehnenpunkte, Strecke-Kreis-Test), `Item`/`Piece`/`Particle`/`Pool`
- [x] `input.js`: Pointer Events, `setPointerCapture`, `getCoalescedEvents()`, Segment-Queue, 150-ms-Spur
- [x] `render.js`: Hintergrund, Items (Zahlenscheiben, Formen, Emoji-Früchte), geclippte Stücke, Partikel, Flecken, Klinge, Fließtexte
- [x] Schnitt entlang der echten Wischlinie: Linie in den lokalen Item-Raum transformiert, Polygon in zwei Hälften geclippt, Stücke mit Trennimpuls (kleines Stück schneller), Gegendrall, Schnitt-Trägheit aus der Fingergeschwindigkeit, Saftpartikel entlang der Sehne, Spritzer am Boden
- [x] Mehrfachschnitt an bereits geschnittenen Stücken (max. 2 zusätzliche)

## 2026-09-07 – M2: Regeln

- [x] `rules.js`: Zahlenregeln (gerade/ungerade/kleiner/größer) mit Schwelle zwischen 25 % und 75 % der Spanne, Formenregeln (1 oder 2 Zielformen), Regelwechsel liefert nie dieselbe Regel zweimal
- [x] Leben (3 Herzen), Timer 90/60 s, −5 s zusätzlich bei falschem Schnitt
- [x] Lernmoment: falsch geschnittenes Item friert ein, färbt sich rot und zeigt die Begründung („15 ist ungerade“, „Das ist ein Dreieck“, „Das ist eine Bombe“) – immer nur die zuletzt ausgelöste
- [x] Regelwechsel alle 30 s: 3 s Vorwarnung (pulsierendes Banner + „Neue Regel gleich…“), dann 2 s Spawn-Pause, Luftraum wird folgenlos geräumt, neue Regel groß eingeblendet
- [x] Verpasstes Ziel kostet kein Leben, setzt aber den Multiplikator zurück (nur in den Regelmodi)

## 2026-09-07 – M3: Screens

- [x] `ui.js`: Hauptmenü, drei Setup-Screens, HUD, Pause, Game Over mit 3-Buchstaben-Namen, Highscores (4 Tabs), Einstellungen, Bestätigungsdialog
- [x] `storage.js`: `schnittninja.v1` mit `version: 2`, Migration aus v1, alles in try/catch, Hinweis im Menü, wenn der Browser nicht speichert
- [x] `tutorial.js`: drei Schritte auf dem echten Canvas (Frucht schneiden → Bombe fliegen lassen → Regel-Banner lesen), einmalig beim ersten Start, jederzeit überspringbar, aus den Einstellungen erneut aufrufbar
- [x] Countdown 3-2-1 mit groß angezeigter Regel

## 2026-09-07 – M4: Politur

- [x] `audio.js`: alles per WebAudio synthetisiert (Wisch, Pop mit steigender Tonhöhe im Combo, Fehlschnitt, Explosion, Multiplikator hoch/runter, Wellen-Sweep, Gold-Chime, Frenzy-Funkeln, Timer-Ticks, Rekord-Jingle); Kontext wird beim ersten Touch entsperrt
- [x] Punkte: Basis 10 × Schwierigkeitsfaktor, +5 je Extra-Item im selben Wischer, Serien-Multiplikator ×1→×4 (10/20/30 Treffer), ×2-Frucht multipliziert obendrauf
- [x] Spezial-Items: Goldene Frucht (+50, flacher und schneller), Sternfrucht-Rausch (5 s nur Ziele, keine Strafen, max. alle 45 s), ×2-Frucht (10 s). In den Regelmodi nur der Rausch – und der respektiert die Regel
- [x] Angekündigte Wellen: frei bei 45/90/150 s und dann alle 45 s, Regelmodi bei 40 s und 70 s (auf 60-s-Runden skaliert)
- [x] Farbfallen im Formen-Modus ab 30 s in jeder 4. Welle, Zuordnung wechselt
- [x] Haptik (`navigator.vibrate`), Bildschirmwackeln, `prefers-reduced-motion` reduziert Partikel, Wackeln und Banner-Puls

## 2026-09-07 – M5: Ship

- [x] PWA: `manifest.json` (Portrait, Fullscreen) + `icon.svg`
- [x] Wake Lock während des Spiels, Pause bei Tab-Wechsel, „Bitte Gerät drehen“ im Querformat auf Touchgeräten
- [x] Tagesrunde: gesetzter Zufallsgenerator aus dem Datum (`mulberry32` über einen FNV-Hash), eigene Tagesbestenliste, die beim Datumswechsel verworfen wird – zweimal gestartet ergibt nachweislich dieselbe Abfolge
- [x] Lokal gegen `python -m http.server` getestet, Index-Generator läuft sauber durch (8 Tools)

## Tests (lokal, gescriptet über die Spielschleife)

| Prüfung | Ergebnis |
|---|---|
| Schnitt entlang der Wischlinie, zwei Stücke + Partikel | ok |
| Punkte: 10 × Faktor, Combo +5, Multiplikator | ok (z. B. 1–20 zufällig = ×1.35 → 14 Punkte) |
| Regelwechsel exakt bei 30 s, neue ≠ alte Regel | ok |
| Welle wird 1 s vorher angekündigt | ok (39 s vor der 40-s-Welle) |
| Falscher Schnitt: −1 Leben, −5 s, roter Stopp mit Begründung | ok |
| Rundenende durch Zeit und durch Leben | ok |
| Highscore-Eintrag inkl. Zahlenraum/Regel/Rundenlänge, Persistenz | ok |
| Formen-Modus: Banner mit Icon, Farbfallen ab 30 s | ok (18 Fallen-Wellen in 70 s) |
| Freies Spiel: Bomben ~10 %, Goldfrucht ~1/27, ×2, Rausch | ok |
| Tagesrunde zweimal gestartet → identische Abfolge | ok |
| Tutorial: alle drei Schritte, `tutorialDone` wird gesetzt | ok |

## 2026-09-07 – Nach dem ersten Spieltest: Lesbarkeit und Rausch

Zwei Rückmeldungen aus dem Test, beide behoben.

### 1. Regelwechsel war zu klein zu lesen

Ursache: `showCenter('Neue Regel!', rule.banner, …)` zeigte die Überschrift mit 34 px, die
**eigentliche neue Regel** aber als 17-px-Grau darunter – die wichtige Hälfte war das kleinste und
blasseste Element. Dasselbe Muster beim Countdown und bei der Vorwarnung („Neue Regel gleich…"
erschien sogar mit leerer Überschrift).

- Zentrale Einblendung neu aus drei Ebenen: `kicker` (18 px, gelb), `main` (40 px, weiß, fett),
  `note` (16 px). Die **Hauptzeile trägt immer die wichtigste Information** – beim Wechsel also die
  Regel selbst (`rule.short`), nicht die Überschrift.
- Beim Regelwechsel liegt die Regel auf einer Karte, das Spielfeld wird über `#centerDim` abgedunkelt.
  Kostet kein Gameplay: In diesen Sekunden pausiert das Spawnen ohnehin und der Luftraum ist leer.
- Karte und Abdunkelung hängen an der **Spielzeit**, nicht an `setTimeout`: Sie verschwinden exakt
  dann, wenn `spawnPause` abläuft und wieder Items starten (`ruleCardUp`). Damit passt es auch,
  wenn zwischendurch pausiert wird oder der Browser Timer drosselt.
- Spawn-Pause beim Wechsel von 2 s auf 2,4 s – bewusste kleine Abweichung vom Briefing zugunsten
  der Lesezeit.
- Vorwarnung jetzt 26 px in Gelb und weiter oben (`.small.high`), damit sie das laufende Spiel nicht verdeckt.
- Countdown zeigt die Regel unter der Ziffer mit 22 px in voller Kontrastfarbe.
- HUD-Banner von 17 auf 19 px, und der operative Teil ist hervorgehoben: „Schneide nur **GERADE Zahlen**".

### 2. Sternfrucht-Rausch war zu chaotisch, Combos kaum erreichbar

Zwei Ursachen – eine davon ein echter Bug:

- **Bug:** `spawnWave()` legte `isTarget` und `allowBomb` beim *Einplanen* fest, die Items entstanden
  aber bis zu 0,35 s später aus `pending` – und `pending` wurde beim Start des Rauschs nie geleert.
  Eine kurz vorher eingeplante Welle spawnte deshalb **verbotene Items und Bomben mitten im Rausch**.
  Genau das Problem „schwer, verbotene Früchte zu meiden".
  Jetzt entscheidet die Closure zur Ausführungszeit, und `_startFrenzy()` verwirft `pending` und
  räumt den Luftraum folgenlos (Regelmodi: alle Nichtziele, freies Spiel: alle Bomben).
- **Design:** 0,36 s Intervall × 2–3 Items ≈ 7 Items/s an zufälligen Positionen – nichts lag je auf
  einer Linie, ein Wisch traf fast nie zwei Items.
  Jetzt **Salven** (`_spawnVolley`): alle 0,85 s vier Items gleichzeitig, gleichmäßig über die Breite
  und auf einer gemeinsamen Linie – abwechselnd waagerechte Reihe (gleiches `vy`) und Fächer
  (gestaffeltes `vy`). Ein Wisch nimmt die ganze Reihe mit.
- Die angekündigten **Wellen** kommen aus demselben Generator als Fächer (6–7 Items). Sie behalten
  ihre Ziel-/Nichtziel-Mischung – die Welle ist ein Regeltest, kein Geschenk –, sind aber lesbar
  statt überfordernd.
- Wird im Rausch doch ein Nachzügler getroffen, zerteilt er sich harmlos ohne Punkte. Vorher wurde
  er nur als `cut` markiert und flog unverändert weiter, was sich wie ein hängender Treffer anfühlte.

### Tests dazu

| Prüfung | Ergebnis |
|---|---|
| Welle einplanen, sofort Rausch starten (alle drei Modi) | 0 verbotene Items, 0 Bomben in 5 s; 25 Items statt ~35 |
| Luftraum-Räumung | 4 Items mit 2 Nichtzielen → 2 Items, 0 Nichtziele; Bombe im freien Spiel verschwindet |
| Salven-Geometrie | 6 Salven à 4 Items; Reihe: identisches `vy`, Fächer: −1336…−1179; Abstand ≥ 69 px |
| Ein waagerechter Wisch durch eine Reihe | **Combo ×4**, 4 Treffer, 8 Stücke, 66 Punkte |
| Welle bei 40 s | Ankündigung bei 39 s, 7 Items als Fächer, x 59…326, keine Bomben |
| Regelkarte | `.main` = Regel mit 40 px, Kicker + Notiz, Dim aktiv; verschwindet exakt mit `spawnPause` |
| Regression | Countdown, Lernmoment (−1 Leben, −5 s, Begründung), Punkte ×Faktor, Rundenende, Highscore-Eintrag, Tutorial – alle unverändert ok |

## 2026-09-08 – Code-Durchsicht: fünf Stellen, an denen sich Teile gegenseitig aufhoben

Vollständige Durchsicht gegen Briefing und dieses Log. Die Architektur trägt; die Fehler lagen
dort, wo zwei für sich korrekte Teile zusammenwirken. Alle Befunde sind belegt und mit einem
Test abgesichert.

### Bestätigte Defekte

**Die Tagesrunde war nicht reproduzierbar – das Feature funktionierte nicht.**
`start()` seedet `this.rnd`, aber `sliceInto()` zog aus demselben Strom 40–70 Zahlen **pro
Schnitt** (Saftpartikel, Fleck), ebenso `_burst()`. Wie oft geschnitten wird, entscheidet der
Spieler – also liefen die Ströme zweier Spieler ab dem ersten Schnitt auseinander und sie
bekamen verschiedene Wurffolgen. Der frühere Testeintrag hat ohne Schnitte gemessen und den
Fehler deshalb nicht gesehen.
Jetzt zwei Ströme: `this.rnd` für alles Spielrelevante, `this.fx` (ungeseedet) für alles rein
Optische. `rules.js` nimmt zusätzlich ein optionales `rnd`-Argument, damit auch geseedete
Regelmodi möglich bleiben – genau die Falle, in die der ursprüngliche Code gelaufen war.

**Das grüne Häkchen für richtige Schnitte wurde nie gezeichnet.**
`_sliceItem()` setzte `item.dead = true` und danach `item.check = 0.4`; `_updateItems()` entfernt
tote Items im selben Frame, bevor `draw()` läuft – `R.drawCheck` war unerreichbar. Damit fehlte
die positive Hälfte des Lernmoments: der rote Stopp existierte, die grüne Bestätigung nicht.
Die Häkchen liegen jetzt in einer eigenen Liste (`this.checks`), unabhängig vom Item.

**Wischgeschwindigkeit wurde auf Sub-Frame-Strecken gemessen – Schnitte fielen aus.**
`input.js` rechnete `Math.max(4, t - prev.t)`. `getCoalescedEvents()` liefert auf 120-Hz-Geräten
Punkte im 1–2-ms-Abstand; die 4-ms-Untergrenze **vergrößert** dort den Nenner und drückte die
gemessene Geschwindigkeit um bis zu Faktor 4. Ein ruhiger Kinderwisch mit real 600 px/s wurde
als 150 px/s gemessen und lag damit unter `MIN_CUT_SPEED` – der Spieler wischt sichtbar durch
die Frucht und nichts passiert. Zusätzlich verwarf `dist > 0.5` bei dichter Abtastung ganze
Teilstrecken.
Jetzt wird vom letzten *ausgegebenen* Punkt aus gemessen (Teilstrecken sammeln sich, statt
verworfen zu werden) und die Geschwindigkeit zusätzlich über ein 50-ms-Fenster der Spur
bestimmt; das Fenster hebt nur an, senkt nie. Damit ist die Messung von der Abtastrate
unabhängig – und der offene Punkt „Wischschwelle ggf. senken" erledigt sich: das Symptom war
nicht die Schwelle, sondern die Messung.

| Abtastung | 16 ms | 8 ms | 4 ms | 2 ms | 1 ms |
|---|---|---|---|---|---|
| vorher, real 600 px/s | 600 | 600 | 600 | 300 | 150 (unter der Schwelle) |
| nachher, real 600 px/s | 600 | 600 | 600 | 600 | 600 |

**iOS-Homescreen-Icon fehlte.** Manifest und `apple-touch-icon` boten nur SVG; iOS ignoriert das
und zeigt einen Screenshot-Platzhalter. `icon-180.png` und `icon-512.png` ergänzt (aus
`icon.svg` gerastert, randvoll und undurchsichtig – die Maske setzt das System selbst).

### Fairness

**Der Rausch-Stern widersprach in den Regelmodi der Regel und bestrafte Regeltreue.**
Er entstand mit `isTarget: true`, obwohl das Banner „Schneide nur GERADE Zahlen" sagt. Wer die
Regel korrekt befolgte und ihn fliegen ließ, verlor dafür den Multiplikator – der Stern zählte
als verpasstes Ziel. Spezial-Items sind jetzt `neutral`: schneiden bringt den Bonus, fliegen
lassen kostet nichts. In den Regelmodi tragen sie zusätzlich einen gestrichelten Ring und die
Beschriftung „BONUS", damit sichtbar ist, dass sie außerhalb der Regel stehen.

**In 60-s-Runden wurde die erste Welle 3 s später wieder eingesammelt.** Wellenzeiten (27/47 s)
und Regelwechsel (30 s) wurden unabhängig voneinander berechnet; die angekündigte Welle bei
27 s räumte `_switchRule()` bei 30 s folgenlos weg. `_planWaves()` schiebt eine Welle, die in
das Fenster vor einem Wechsel fällt, dahinter (60 s: eine Welle bei 40 s statt einer, die
verpufft). 90-s-Runden bleiben unverändert bei 40/70 s.

**Der Trefferkreis war für Dreieck und Stern viel zu groß.** Ein Dreieck füllt seinen
Trefferkreis nur zu ~41 %. Im Formen-Modus kostete ein sichtbar danebengegangener Wisch trotzdem
ein Leben und 5 Sekunden, und `sliceInto` schnitt dann ersatzweise durch die Mitte – die
Schnittlinie passte nicht einmal zum Wisch. Der Kreis ist jetzt nur noch Grobphase, danach
entscheidet `segPolyHit()` am echten Polygon. Kreise verhalten sich unverändert.

**Seitlich abgetriebene Ziele zählten als „verpasst".** Items sterben auch bei `x < -160` bzw.
`x > W + 160`; solche Ziele waren nie erreichbar, setzten aber den Multiplikator zurück. Gezählt
wird jetzt nur noch, was unten hinausfällt.

### Darstellung und Daten

- **Die DOM-Oberfläche skalierte nicht mit dem Spielfeld.** `#stage` bekam die letterboxte Größe
  in CSS-Pixeln, die Overlays blieben in Design-Größe. Auf großen Geräten wuchs die
  Canvas-Grafik, die Schrift nicht – dieselbe Fehlerklasse wie beim Regelwechsel, nur auf
  Geräteebene. `#stage` bleibt jetzt 390×844 und wird als eine Ebene per `transform: scale()`
  skaliert; der Canvas-Puffer wächst weiter mit `dpr`, der Text bleibt scharf.
  Gemessen am Anteil der Bannerbreite an der Bühnenbreite:

  | Maßstab | 1,00 | 1,05 | 1,30 | 1,80 | 2,40 |
  |---|---|---|---|---|---|
  | vorher | 0,872 | 0,829 | 0,671 | 0,484 | 0,363 |
  | nachher | 0,872 | 0,872 | 0,872 | 0,872 | 0,872 |

  `maximum-scale=1, user-scalable=no` ist entfallen: es blockierte Pinch-Zoom für Nutzer mit
  Sehschwäche und ist überflüssig, seit `touch-action` und `gesturestart` gesetzt sind.
- Beim Regelwechsel zerstäuben die Items sichtbar (`_burst`), statt wegzublinken – wie beim
  Rausch, der es an derselben Stelle schon richtig machte.
- Highscore-Namen laufen durch `esc()`. `<B>` ist ein gültiger Drei-Zeichen-Name und zerlegte
  vorher die Liste.
- Der Punktestand wird jetzt beim Rundenende sofort eingetragen und der Name danach im Eintrag
  gepflegt. Vorher ging ein Lauf verloren, wenn der Game-Over-Screen ohne Knopfdruck verlassen
  wurde – Neuladen, Zurück-Taste, Tab schließen.

### Tests dazu

| Prüfung | Ergebnis |
|---|---|
| Tagesrunde: ohne Schnitte vs. 176 Schnitte, 90 s | Wurffolge identisch (vorher: Abweichung ab Item 49) |
| Tagesrunde: zweimal gleich gespielt | identisch; einzige Abweichung bleibt der selbst ausgelöste Rausch – ein Spielereignis, kein Zufall |
| Häkchen nach richtigem Schnitt | erscheint, überlebt den Folgeframe, läuft nach 0,4 s aus (vorher: nie sichtbar) |
| Wischmessung 16/8/4/2/1 ms bei 600 px/s | konstant 600; Tipp und langsame Bewegung (≤ 250 px/s) weiterhin ignoriert |
| Bonus-Stern fliegen lassen (Formen-Modus) | Multiplikator bleibt ×3; schneiden: kein Lebensverlust, Rausch startet |
| Wellen-/Wechselplan 60 s und 90 s | 0 Kollisionen (60 s: Wechsel 30, Welle 40; 90 s: unverändert 40/70) |
| Dreieck knapp verfehlt / mitten durch | 3 Leben / 2 Leben – im Browser mit echten Pointer-Events |
| Seitlich raus vs. unten raus | Multiplikator bleibt / wird zurückgesetzt |
| Klinge unter dem Finger nach der Skalierungsänderung | Rückrechnung auf 4 Punkten exakt, Fehler 0,0000 px |
| Name `<B>` in der Bestenliste | erscheint als Text (`&lt;B&gt;`) |
| Runde beenden, neu laden ohne Knopfdruck | Eintrag steht in der Liste |
| Regression | Punkte 10×Faktor, Combo ×4 in der Rausch-Reihe, Regelwechsel bei 30 s mit leerem Luftraum, falscher Schnitt (−1 Leben, −5 s, Begründung), Rundenende durch Zeit und durch Leben, Tutorial – alle unverändert ok |
| Browser | keine Konsolenfehler, Manifest löst die PNG-Icons auf |

## 2026-09-08 – Bonus-Mechanik aus den Regelmodi, Zeitlimit im freien Spiel, Regelwerk im Spiel

Rückmeldung nach der Durchsicht: Rausch und Wellen passen nicht in die Regelmodi – die Gefahr,
dabei unbeabsichtigt etwas Verbotenes zu treffen, ist zu groß. Dazu ein Zeitlimit fürs freie
Spiel und eine gründlichere Erklärung von Punkten und Regeln.

### Rausch und Wellen nur noch im freien Spiel

Beide belohnen dasselbe: schnell und ohne Nachdenken durchzuwischen. In den Regelmodi ist genau
das die falsche Haltung – dort soll der Spieler vor jedem Wisch prüfen, ob das Objekt zur Regel
passt. Ein dichter Schwung von sechs Objekten oder fünf Sekunden Rausch machen daraus ein
Reaktionsspiel, in dem man die verbotenen Items zwangsläufig mitnimmt.

- `_maybeSpecial()` steigt in den Regelmodi sofort aus. Kein Rausch, keine goldene Frucht, kein
  ×2 – geprüft über 3000 Würfe je Modus und über volle 90-Sekunden-Runden: es entstehen
  ausschließlich `number`- bzw. `shape`-Items.
- `waveTimes` ist in den Regelmodi leer. Damit entfällt auch `_planWaves()` von heute Vormittag:
  ohne Wellen in den Regelmodi und ohne Regelwechsel im freien Spiel kann es keine Kollision
  mehr geben.
- Mit den Bonus-Items in den Regelmodi entfallen die Flags `neutral` und `bonus` samt
  BONUS-Ring – sie waren nur dort nötig und wären jetzt toter Code.

### Zeitlimit im freien Spiel

Bisher lief das freie Spiel bis zum dritten Fehler und ohne Bomben gar nicht – und die
Bestenliste verglich einen Zehn-Minuten-Lauf mit einem Zwei-Minuten-Lauf.

- Rundenlänge 90 s (Vorgabe), 60 s oder „Ohne Limit". Der Timer-Balken erscheint entsprechend.
- `timed` hängt jetzt an der Rundenlänge, nicht mehr am Modus: `cfg.seconds > 0`.
- Wellen im freien Spiel skalieren mit der Rundenlänge (90 s → 45/75 s, 60 s → 30/50 s); ohne
  Limit bleibt die alte, endlose Liste.
- Die Tagesrunde läuft immer 90 s, unabhängig von der Einstellung daneben – nur so vergleicht
  sie überhaupt etwas.
- Die Rundenlänge steht jetzt auch im Highscore-Eintrag des freien Spiels und in der Liste
  („60 s" bzw. „ohne Limit").
- **Bewusst nicht übernommen:** die Zeitstrafe von −5 s bleibt den Regelmodi vorbehalten. Sie
  hing vorher an `timed`; jetzt, wo auch das freie Spiel auf Zeit läuft, hätte das die Bombe
  stillschweigend verschärft. Im freien Spiel kostet sie weiterhin nur ein Leben (Briefing §2).

### Punkte und Regeln werden im Spiel erklärt

Neuer Bildschirm „❓ Punkte & Regeln" im Hauptmenü mit sechs Abschnitten: wie gewischt wird, die
drei Modi und der Regelwechsel, die Punkteformel mit durchgerechnetem Beispiel, die Tabelle der
Schwierigkeitsfaktoren, Leben/Zeit/Rundenende, und was es nur im freien Spiel gibt – samt
Begründung, warum es das in den Regelmodi nicht gibt.

Jede Zahl im Text ist gegen den Code geprüft, nicht aus dem Gedächtnis geschrieben:

| Aussage im Hilfetext | gegen den Code |
|---|---|
| Treffer = 10 × Faktor | `base = 10 * this.factor` |
| jedes weitere Objekt im Wisch +5 × Faktor | `comboBonus = comboCount > 1 ? 5 * factor : 0` |
| Serie ×2/×3/×4 ab 10/20/30 Treffern, auf Treffer und Combo | `(base + comboBonus) * mult` |
| Beispiel 1–20, drei Zahlen in einem Wisch: 12 + 18 + 18 = 48 | gemessen: 48 (bei Serie ×2: 96) |
| Faktoren 1.0/1.2/1.5/2.0, +0.3, +0.15, Formen 1.0/1.5 | `Rules.numbersFactor` / `shapesFactor` |
| Goldene Frucht +50 | gemessen: 50 |

Dazu erklären die Einstellungs-Bildschirme den Faktor jetzt in einem Satz, statt nur „Punkte
×1.2" anzuzeigen.

### Tests dazu

| Prüfung | Ergebnis |
|---|---|
| Zahlen/Formen, volle 90-s-Runde | nur `number`/`shape`; kein Rausch, kein Gold, kein ×2, keine Bombe, keine Welle |
| `_maybeSpecial` in den Regelmodi, 3000 Würfe je Modus | 0 Spezial-Items (freies Spiel zum Vergleich: ~250) |
| Wellenplan | Zahlen/Formen `[]`; frei 90 s `[45,75]`, 60 s `[30,50]`, ohne Limit unverändert |
| Freies Spiel 60 s | Uhr läuft, Balken sichtbar, Runde endet von selbst |
| Freies Spiel „Ohne Limit" | läuft nach 200 s weiter, kein Balken |
| Tagesrunde bei gewählten 60 s | startet trotzdem mit 90 s und gesetztem Seed |
| Zeitstrafe | Zahlen: −1 Leben und −5 s · frei (auf Zeit): −1 Leben, 0 s |
| Highscore-Liste „Frei" | zeigt „60 s" bzw. „ohne Limit" |
| Hilfetext | alle Zahlen gegen `game.js`/`rules.js` nachgerechnet (Tabelle oben) |
| Regression | Punkte 10×Faktor, Combo ×4, Regelwechsel bei 30 s mit leerem Luftraum, Lernmoment, grünes Häkchen, Rundenende, Tagesrunde weiterhin geseedet – alle ok |
| Browser | Menü, Hilfe-Bildschirm, freies Setup und beide Regelmodi ohne Konsolenfehler |

## Entscheidungen, die vom Briefing abweichen oder es präzisieren

- **Schwierigkeitsfaktor bei „Zufällig“:** +0.15 statt +0.3. Die Zufallsregel mischt leichte (gerade/ungerade) und schwere (kleiner/größer) Regeln, der halbe Aufschlag bildet das ehrlicher ab.
- **Pause-Menü:** dritter Knopf heißt „Runde beenden“ statt „Zum Menü“ und führt in den Game-Over-Screen. Weiterhin nötig für „Ohne Limit“ ohne Bomben – mit Zeitlimit (seit 08.09. Vorgabe) endet die Runde von selbst (Briefing §12).
- **Tagesrunde** wird nur in der Tagesbestenliste geführt, nicht zusätzlich in der Liste des freien Spiels – sonst stünden die (gleichen) Läufe doppelt.
- **Sternfrucht, goldene Frucht, ×2 und Wellen gibt es nur im freien Spiel** (seit 08.09.). Der frühere ⚡-Ersatz im Formen-Modus ist damit hinfällig – dort kommt gar kein Bonus-Item mehr vor.
- **Frisch entstandene Stücke** sind 0,15 s lang gegen Mehrfachschnitt gesperrt; sonst zerlegt ein einziger schneller Wischer ein Item im selben Frame in viele Splitter.
- **Spawn-Pause beim Regelwechsel** 2,4 s statt 2 s, damit die große Regelkarte in Ruhe gelesen
  werden kann; Karte und Abdunkelung enden exakt mit der Pause.
- **Rausch und Wellen als Salven** statt als Zufallsstrom – das Briefing beschreibt „dichte Wellen",
  legt die Verteilung aber nicht fest. Gleichzeitig startende Reihen sind die Voraussetzung dafür,
  dass Combos überhaupt spielbar sind statt Glückssache.
- **Service Worker** bewusst weggelassen (im Briefing optional): Das Spiel lädt in wenigen KB, ein Cache brächte vor allem Risiko, veraltete Versionen auszuliefern. Das Manifest allein reicht für „Zum Home-Bildschirm“.

## Offene Punkte

- Auf echten Geräten testen: iOS Safari (Audio-Entsperrung, 100-vh-Verhalten, Gummiband-Scrollen) und Android Chrome; 60 fps auf Mittelklasse-Hardware
- Playtest mit der Zielgruppe: Wird der Regelwechsel verstanden? Ist die Begründung im Tempo lesbar? Sind 90 s die richtige Länge?
- Tuning-Kandidaten aus Briefing §12: Doppelbestrafung (−1 Leben **und** −5 s), Wechselintervall 30 s ggf. als Option (30/45/aus), Spreizung der Schwierigkeitsfaktoren zwischen 1–10 und 1–99
- Wischschwelle bleibt bei 280 logischen px/s. Die Messung ist seit dem 08.09. abtastratenunabhängig – erst ein Playtest sollte zeigen, ob der Wert selbst noch zu hoch ist
- Bewusst offen gelassen: Testsuite für `rules.js`/`entities.js` (beide sind DOM-frei und ließen sich mit `node --test` direkt prüfen), Service Worker für Offline-Betrieb, Android-Zurück-Taste
