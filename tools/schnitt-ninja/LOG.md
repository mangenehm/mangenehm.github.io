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

## Entscheidungen, die vom Briefing abweichen oder es präzisieren

- **Schwierigkeitsfaktor bei „Zufällig“:** +0.15 statt +0.3. Die Zufallsregel mischt leichte (gerade/ungerade) und schwere (kleiner/größer) Regeln, der halbe Aufschlag bildet das ehrlicher ab.
- **Pause-Menü:** dritter Knopf heißt „Runde beenden“ statt „Zum Menü“ und führt in den Game-Over-Screen. Nur so hat das endlose freie Spiel ohne Bomben ein Ende, bei dem der Punktestand zählt (Briefing §12).
- **Tagesrunde** wird nur in der Tagesbestenliste geführt, nicht zusätzlich in der Liste des freien Spiels – sonst stünden die (gleichen) Läufe doppelt.
- **Sternfrucht im Formen-Modus** ist ein ⚡ statt ⭐, weil „Stern“ dort eine Zielform ist und ein Stern-Emoji verwechselbar wäre.
- **Frisch entstandene Stücke** sind 0,15 s lang gegen Mehrfachschnitt gesperrt; sonst zerlegt ein einziger schneller Wischer ein Item im selben Frame in viele Splitter.
- **Service Worker** bewusst weggelassen (im Briefing optional): Das Spiel lädt in wenigen KB, ein Cache brächte vor allem Risiko, veraltete Versionen auszuliefern. Das Manifest allein reicht für „Zum Home-Bildschirm“.

## Offene Punkte

- Auf echten Geräten testen: iOS Safari (Audio-Entsperrung, 100-vh-Verhalten, Gummiband-Scrollen) und Android Chrome; 60 fps auf Mittelklasse-Hardware
- Playtest mit der Zielgruppe: Wird der Regelwechsel verstanden? Ist die Begründung im Tempo lesbar? Sind 90 s die richtige Länge?
- Tuning-Kandidaten aus Briefing §12: Doppelbestrafung (−1 Leben **und** −5 s), Wechselintervall 30 s ggf. als Option (30/45/aus), Spreizung der Schwierigkeitsfaktoren zwischen 1–10 und 1–99
- Wischschwelle steht bei 280 logischen px/s – falls jüngere Kinder zu langsam wischen, weiter senken
