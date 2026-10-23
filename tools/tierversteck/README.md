# Tierversteck

Schiffe versenken auf einer echten Karte: Der Ersteller wählt eine Adresse, daraus entsteht ein Raster-Spielbrett aus OpenStreetMap-Daten, auf dem beide Spieler fünf Tiere verstecken. Läuft komplett statisch auf GitHub Pages – ohne eigenen Server und ohne Build-Schritt.

Live: https://mangenehm.github.io/tools/tierversteck/

## Spielregeln

Jede Seite versteckt fünf Tiere mit zusammen 16 Feldern. Wer zuerst alle Tiere des anderen findet, gewinnt.

| Tier | Felder | Form | Lieblingsgelände |
| --- | --- | --- | --- |
| Schlange | 5 | Zickzack (S-Form) | Wald, Gebüsch |
| Pferd | 4 | L-Form (wie der Springer) | Wiese, Feld, Park |
| Hund | 3 | gerade | Straße, Weg |
| Katze | 3 | Ecke | Gebäude |
| Maus | 1 | Einzelfeld | Gebäude |

- Tiere dürfen gedreht und gespiegelt werden, sich aber nicht überlappen oder berühren (auch nicht diagonal).
- Abwechselnd wird ein Feld abgesucht: **Daneben**, **Treffer** oder **Gefunden** (Tier vollständig aufgedeckt). Ein Treffer gibt keinen Extra-Schuss.
- **Konter-Schuss:** Ein Tier ist „im Lieblingsgelände“, wenn mindestens die Hälfte seiner Felder (aufgerundet) darauf liegt. Wird so ein Tier zum ersten Mal getroffen, schießt sein Besitzer sofort zurück; danach folgt sein normaler Zug. Höchstens ein Konter pro Tier, und ein Konter löst keinen weiteren aus.
- Beim Verstecken glänzt ein Tier ✨, solange es im Lieblingsgelände steht.
- Wasser darf belegt werden, ist aber für kein Tier Lieblingsgelände.

## Modi

- **Zu zweit an einem Gerät (Hot-Seat):** Zwischen den Zügen verdeckt ein Sichtschutz das Brett.
- **Online:** Der Ersteller teilt einen Link `…/#room=<id>` (Kopieren, Teilen-Dialog oder QR-Code). Trystero baut die WebRTC-Verbindung über öffentliche Nostr-Relays auf; danach laufen die Daten direkt zwischen den Browsern. Nach einem Reload oder kurzem Abbruch geht es mit dem Stand aus `sessionStorage` weiter.

**Schummelschutz:** Jede Seite beantwortet die Schüsse auf ihr Brett selbst. Vor dem ersten Schuss sendet jede Seite SHA-256(Aufstellung + Salz); am Ende werden Aufstellung und Salz offengelegt und alle Antworten nachgeprüft. Abweichungen erscheinen als „Spiel ungültig“.

## Aufbau

```
tools/tierversteck/
├─ index.html, style.css, tool.json, icon.svg
├─ src/
│  ├─ engine/      reine Logik ohne DOM, voll getestet
│  │  ├─ shapes.js   Tierformen, Drehen, Spiegeln
│  │  ├─ board.js    Zellen, Geländeklassen, Platzierungsprüfung, Zufallsbrett
│  │  ├─ rules.js    Schuss auflösen, Lieblingsgelände, Konter, Zugfolge
│  │  └─ game.js     Zustandsmaschine (Lobby → Verstecken → Spiel → Ende)
│  ├─ map/
│  │  ├─ geocode.js  Adresse → Koordinaten (Nominatim, nur beim Absenden, ≤ 1/s)
│  │  ├─ overpass.js OSM-Daten laden (2 Ausweich-Endpunkte, Cache), in Zellkoordinaten umrechnen
│  │  ├─ classify.js Features rastern, Pixel je Zelle zählen → Geländeklasse
│  │  ├─ render.js   Karte in Spielfarben, Geländeflächen, Raster mit Koordinaten
│  │  └─ build.js    Ausschnitt laden/verschieben, Brett bauen
│  ├─ net/
│  │  ├─ transport.js  gemeinsames Interface
│  │  ├─ local.js      Hot-Seat-Transport
│  │  ├─ trystero.js   Online-Transport mit zuverlässiger Zustellung und Wiederverbinden
│  │  ├─ bc-room.js    Test-Hook: ?net=bc verbindet zwei Tabs per BroadcastChannel
│  │  ├─ protocol.js   Nachrichtentypen und Prüfung
│  │  └─ commit.js     Hash-Commitment und Nachprüfung
│  ├─ ui/          Screens: Start, Erstellen, Lobby/Beitreten, Verstecken, Spiel, Ende, Sichtschutz
│  ├─ app/         Abläufe für Hot-Seat und Online
│  └─ main.js
├─ assets/         generierte Grafiken (webp) + manifest.json
├─ vendor/         trystero.js, qrcode.js (gebündelt, MIT)
├─ scripts/        generate-assets.mjs + prompts.json (OpenRouter)
└─ test/           node:test – Engine, Karte, Netz
```

Die Engine weiß nicht, ob der Gegner online oder am selben Gerät sitzt: Hot-Seat sind zwei Engines, verbunden über den lokalen Transport.

## Entwickeln

```sh
cd tools/tierversteck
npm test                 # node --test, keine Abhängigkeiten nötig
npm run serve            # http://localhost:8000/tools/tierversteck/
```

Online-Modus ohne Relays testen: `…/tools/tierversteck/?net=bc` in zwei Tabs öffnen.

## Grafiken

Ohne Grafiken zeichnet die App eigene Sticker-Formen mit Emoji. Generierte Sticker werden automatisch genutzt, sobald sie in `assets/manifest.json` stehen:

```sh
echo "OPENROUTER_API_KEY=sk-or-…" > .env          # bleibt lokal (.gitignore)
node scripts/generate-assets.mjs --list-models    # Bildmodell aussuchen
node scripts/generate-assets.mjs --model <slug>   # Varianten nach scripts/out/
npm i --no-save sharp
node scripts/generate-assets.mjs --pick snake=2 horse=1 dog=3 …
```

`--pick` stellt den Magenta-Hintergrund frei, skaliert und schreibt WebP nach `assets/`. Die Tier-Sticker werden auf die Bounding Box der Form gelegt, mit der Form-Maske beschnitten und mitgedreht.

## Lizenzen

Kartendaten © OpenStreetMap-Mitwirkende (ODbL). Gebündelte Bibliotheken siehe `vendor/README.md`.
