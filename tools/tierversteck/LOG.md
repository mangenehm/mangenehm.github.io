# Tierversteck – Entwicklungs-Log

Plan: „Tierversteck – Implementierungsplan“ (23.10.2026). Umgesetzt als Tool unter `tools/tierversteck/` (Repo-Konvention: `tool.json` + `index.html`, Startseiten-Index per GitHub Action).

## Abweichungen vom Plan

| Plan | Umsetzung | Grund |
| --- | --- | --- |
| Vite + TypeScript, `vite build` | Native ES-Module in Vanilla-JS, kein Build | Das Repo hat keinen Build-Schritt; Pages liefert die Dateien direkt aus (wie bei Schnitt-Ninja) |
| `.github/workflows/deploy.yml` | entfällt | Der bestehende Pages-Auftritt und `update-index.yml` übernehmen das |
| Vitest | `node --test` | keine Abhängigkeiten nötig |
| `osmtogeojson` | eigene Umwandlung mit `out geom` (Ringe zusammenfügen, beschneiden, vereinfachen) | spart eine Bibliothek, Geometrie kommt kompakt beim Mitspieler an |
| Trystero vom CDN | gebündelt in `vendor/trystero.js` | keine Laufzeitabhängigkeit von CDNs |
| eigene `counter`-Nachricht | `counter: true` im `result` | gleiche Information, eine Nachricht weniger |

## Meilensteine

- [x] M1 Gerüst + Engine – Formen (Drehen/Spiegeln), Platzierung (auch diagonal berühren verboten), Schuss, Lieblingsgelände, Konter, Zugfolge, Zustandsmaschine, Zufallsgelände; Tests
- [x] M2 Karte – Nominatim-Suche beim Absenden mit Trefferliste, Brettgröße 8–12, Zellgröße 20/35/50 m, verschiebbarer Ausschnitt (Pfeile oder Ziehen, 3 Zellen Rand vorgeladen), Overpass mit Ausweich-Endpunkten und `localStorage`-Cache, Rasterung je Klasse mit Priorität bei Gleichstand, eigenes Rendering, Geländeverteilung mit 80-%-Warnung, OSM-Hinweis
- [x] M3 Hot-Seat – Verstecken (Tippen, Ziehen, Doppeltipp/R drehen, F spiegeln, Zufällig), Glanz im Lieblingsgelände, Zielen + Bestätigen (später: direkter Tipp), Sichtschutz mit Zusammenfassung der gegnerischen Züge, Endbildschirm, Revanche
- [x] M4 Online – Trystero-Transport, Einladungslink, Teilen-Dialog, QR-Code, Protokoll mit Prüfung jeder Nachricht, Commitment und Nachprüfung beim Aufdecken, Wiederverbinden nach Reload (Postausgang + `sync`), Dritte im Raum werden ignoriert
- [x] M5 Grafiken – mit OpenRouter (`google/gemini-3.1-flash-image`) erzeugt: 5 Tier-Sticker, Pfote (Treffer), Staubwolke (Daneben), Titelbild; freigestellt mit `scripts/postprocess-assets.py`, eingebaut mit Maskierung und Drehung. Pferd und Katze gespiegelt, damit der Kopf in der Form liegt. Keine eigenen Kopf-Grafiken – Legenden nutzen Emoji
- [x] M6 Feinschliff (teilweise) – Mobile-Layout, `prefers-reduced-motion`, Vibration bei eigenem Zug, README mit Regeln. Offen: Sounds, Online-Revanche

## Umbau 24.10.2026: Echte Orte statt Kästchen

Problem: Das Quadratraster mit Mehrheitsentscheid je Zelle machte die Gegend unkenntlich (Raster über Gebäudeumrissen), das Gelände je Zelle wirkte beliebig, und der Konter-Schuss störte den Spielfluss.

- Spielfelder sind jetzt Orte: Flächen zwischen trennenden Straßen/Bahn/Flüssen (Flood-Fill auf dem Raster), getrennt nach Zone, Krümel verschmolzen, Riesen per k-means geteilt, auf etwa die Zielanzahl gebracht (Klein/Mittel/Groß ≈ 28/38/48 Orte). Nachbarn = gemeinsame Grenze nach dem Auffüllen der Straßenpixel, also auch über die Straße.
- Gelände je Ort eindeutig (Häuser, Wiese/Park, Wald, Platz/Hof, Wasser), Namen aus benannten Flächen, Wahrzeichen oder der angrenzenden Straße.
- Darstellung als gezeichneter Stadtplan statt Gebäudeumrissen: Muster je Gelände, Straßen mit Namen, Wahrzeichen-Emoji, Ortsnummern.
- Tiere belegen 1–3 benachbarte Orte statt fester Formen; „nicht berühren“ entfällt.
- Konter-Schuss ersetzt durch **Spuren**: Daneben neben einem Tier außerhalb seines Lieblingsgeländes meldet 👣. Wird beim Aufdecken mitgeprüft. Protokoll-Version 2.
- Zufallsgelände → „Fantasie-Gegend“ aus verzerrten Voronoi-Orten.
- Geprüft mit Münster (Prinzipalmarkt): 44 Orte, Straßenzüge, Domplatz und Wahrzeichen gut wiederzuerkennen.

## 24.10.2026: Mehr Orte + Zoom

Problem: Mit 30–48 Orten und 9 belegten waren die Tiere auf großen Karten zu schnell gefunden; kleinere Orte wären auf dem Handy fummelig.

- Zielanzahl Klein/Mittel/Groß ≈ 55/85/110 Orte, große Blöcke werden früher geteilt (`MAX_SHARE` 1,6), höchstens 200 Orte je Brett.
- Tiere größer: Schlange 3, Pferd 4, Hund 3, Katze 2, Maus 1 = 13 Orte (≈ 15 % bei 85). Protokoll-Version 3.
- Zoom im Brett (`src/ui/zoom.js` + BoardView): ＋/−/Übersicht, Pinch, Mausrad, gezoomt verschieben; Tipp vs. Ziehen mit 8 px Schwelle; Auto-Lupe, wenn ein Ort im Mittel unter 34 px liegt. Kartenbild wird während der Geste nur skaliert und danach scharf neu gezeichnet. Nummern erst ab ≈ 40 px Ortsgröße.
- Nach dem Suchen und nach „Zufall“ springt das Brett zurück zur Übersicht. Vorschau beim Erstellen und Endbildschirm bleiben ohne Zoom.
- Geprüft: Münster Mittel → 98 Orte, Auto-Lupe/Verschieben/Wählen in 390 px Breite; komplette Hot-Seat-Partie (73 Suchen je Seite, 16–18 % Treffer); Mausrad am Desktop.

## 24.10.2026: Direkter Tipp + Rückmeldungen für Kinder

Problem: Suchen brauchte zwei Schritte (Ort wählen, dann bestätigen); das Ergebnis kam als Satz oben in der Karte – zu zäh und für Kinder, die noch nicht lesen, unverständlich.

- Ein Tipp sucht sofort. Schon abgesuchte Orte geben ein „Nö“-Geräusch. Auto-Lupe und Tipp/Ziehen-Schwelle schützen weiterhin vor Fehltipps auf kleinen Orten.
- Ergebnis direkt am Ort als große Animation (Staubwolke, Pfote, Spuren-Fußabdrücke; gefunden: Tier groß in der Brettmitte mit Konfetti), dazu Geräusch (WebAudio, ohne Dateien), Vibration und kurze Ansage per `speechSynthesis` („Treffer!“, „Du hast den Hund gefunden!“). Gezoomt bleibt das Brett stehen, bis die Animation gelaufen ist.
- Kopfkarte nur noch mit Symbol + höchstens einem Wort (👆 Du bist dran!, ⏳ Name, 💨 Daneben, 🐾 Treffer!). Die ausführlichen Sätze gehen an Screenreader.
- Hot-Seat: Sichtschutz mit Bild (📱👉) und Ansage „Bo ist dran.“; beim Start des eigenen Zugs laufen die Suchen des Gegners als Animation auf dem eigenen Revier ab; „Weiter“ erscheint erst nach der Animation.
- Verstecken: Geräusche beim Antippen, „Plopp“ + ✨ wenn ein Tier fertig ist, Glitzerklang im Lieblingsgelände. Endbildschirm mit Fanfare, Konfetti und Ansage des Siegers.
- 🔊/🔇 in der Kopfzeile (gespeichert in `localStorage`). `prefers-reduced-motion` zeigt die Symbole ohne Bewegung.

## 24.10.2026: Treffer = nochmal, nur Töne, nur online

- Nach Treffer oder Gefunden sucht man gleich nochmal, nach Daneben wechselt der Zug (wie Schiffe versenken). Kopfkarte zeigt dann 👆 Nochmal!, das Brett bleibt gezoomt. Protokoll-Version 4.
- Sprachausgabe wieder entfernt – nur noch Geräusche.
- Modus „Zu zweit an einem Gerät“ entfernt (Hot-Seat-Ablauf, Sichtschutz, Revanche). `local.js` bleibt als Transport für die Tests.

## 24.10.2026: Kurzer Raum-Code

- Raum-Code 4 statt 10 Zeichen (Alphabet ohne l/o/0/1, ≈ 1 Mio. Codes), in der Lobby groß und in Großbuchstaben. Beitreten ignoriert Groß/Klein. Spieler-IDs bleiben 16 Zeichen.

## Offene Punkte

- Revanche im selben Raum (derzeit: neues Spiel)
- WebRTC hinter strikten Firewalls: nur Fehlermeldung, kein TURN-Server
