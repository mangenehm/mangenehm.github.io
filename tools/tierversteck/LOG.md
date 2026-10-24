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
- [x] M3 Hot-Seat – Verstecken (Tippen, Ziehen, Doppeltipp/R drehen, F spiegeln, Zufällig), Glanz im Lieblingsgelände, Zielen + Bestätigen, Sichtschutz mit Zusammenfassung der gegnerischen Züge, Endbildschirm, Revanche
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

## Offene Punkte

- Online-Revanche im selben Raum (derzeit: neues Spiel)
- Playtest: Maus auf 12×12 ggf. zu schwer
- WebRTC hinter strikten Firewalls: nur Fehlermeldung, kein TURN-Server
