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

## Offene Punkte

- Online-Revanche im selben Raum (derzeit: neues Spiel)
- Playtest: Maus auf 12×12 ggf. zu schwer
- WebRTC hinter strikten Firewalls: nur Fehlermeldung, kein TURN-Server
