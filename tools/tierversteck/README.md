# Tiersuche

Verstecken und Suchen in der echten Nachbarschaft: Der Ersteller wählt eine Adresse, daraus entsteht aus OpenStreetMap-Daten ein gezeichneter Stadtplan. Die Spielfelder sind echte **Orte**: Häuserblöcke, Parks, Wälder, Plätze und Teiche, begrenzt von echten Straßen. Beide Spieler verstecken darauf fünf Tiere. Läuft komplett statisch auf GitHub Pages – ohne eigenen Server und ohne Build-Schritt.

Live: https://mangenehm.github.io/tools/tierversteck/

## Spielregeln

Jede Seite versteckt fünf Tiere auf zusammen 13 Orten. Wer zuerst alle Tiere des anderen findet, gewinnt.

| Tier | Orte | Lieblingsgelände |
| --- | --- | --- |
| Schlange | 3 | Wald |
| Pferd | 4 | Wiese, Park |
| Hund | 3 | Platz, Hof |
| Katze | 2 | Häuser |
| Maus | 1 | Häuser |

- Ein Tier mit mehreren Orten belegt benachbarte Orte (sie grenzen aneinander oder liegen sich an einer Straße gegenüber). Zwei Tiere teilen sich nie einen Ort; berühren ist erlaubt.
- Abwechselnd wird ein Ort abgesucht – ein Tipp genügt, ohne Bestätigen: **Daneben** 💨, **Treffer** 🐾 oder **Gefunden** (Tier vollständig aufgedeckt). Nach Treffer oder Gefunden darf man nochmal, nach Daneben ist der andere dran.
- **Spuren 👣:** Ein Tier ist „im Lieblingsgelände“, wenn mindestens die Hälfte seiner Orte (aufgerundet) dazu passt. Geht eine Suche daneben, meldet die Antwort Spuren, wenn ein Nachbarort ein noch nicht gefundenes Tier enthält, das **nicht** im Lieblingsgelände steht. Tiere im Lieblingsgelände sind unsichtbar – dafür sucht der Gegner dort zuerst.
- Beim Verstecken glänzt ein Tier ✨, solange es im Lieblingsgelände steht.
- Wasser darf belegt werden, ist aber für kein Tier Lieblingsgelände.
- Rückmeldungen sind auch ohne Lesen verständlich: große Animation direkt am Ort, Geräusch und Symbole statt Sätzen. 🔊 oben rechts schaltet die Töne ab.
- Ein Brett hat je nach Gebiet etwa 55/85/110 Orte. Zum bequemen Antippen lässt sich das Brett zoomen (＋/−, zwei Finger, Mausrad) und gezoomt verschieben; sind die Orte sehr klein, zoomt der erste Tipp automatisch heran.

## Online spielen

Gespielt wird nur online, jede Seite auf ihrem eigenen Gerät. Der Ersteller teilt einen Link `…/#room=<id>` (Kopieren, Teilen-Dialog oder QR-Code) oder den vierstelligen Raum-Code zum Abtippen auf der Startseite. Trystero baut die WebRTC-Verbindung über öffentliche Nostr-Relays auf; danach laufen die Daten direkt zwischen den Browsern. Nach einem Reload oder kurzem Abbruch geht es mit dem Stand aus `sessionStorage` weiter.

**Schummelschutz:** Jede Seite beantwortet die Schüsse auf ihr Brett selbst. Vor dem ersten Schuss sendet jede Seite SHA-256(Aufstellung + Salz); am Ende werden Aufstellung und Salz offengelegt und alle Antworten nachgeprüft. Abweichungen erscheinen als „Spiel ungültig“.

## Aufbau

```
tools/tierversteck/
├─ index.html, style.css, tool.json, icon.svg
├─ src/
│  ├─ engine/      reine Logik ohne DOM, voll getestet
│  │  ├─ shapes.js   Tiere (Anzahl Orte, Lieblingsgelände), Geländeklassen
│  │  ├─ board.js    Orte, Nachbarschaftsgraph, Platzierungsprüfung, Zufallsaufstellung
│  │  ├─ rules.js    Suche auflösen, Spuren, Lieblingsgelände
│  │  └─ game.js     Zustandsmaschine (Lobby → Verstecken → Spiel → Ende)
│  ├─ map/
│  │  ├─ geocode.js  Adresse → Koordinaten (Nominatim, nur beim Absenden, ≤ 1/s)
│  │  ├─ overpass.js OSM-Daten + Wahrzeichen laden (Ausweich-Endpunkte, Cache), in Brettkoordinaten umrechnen
│  │  ├─ classify.js Features rastern: Flächenklasse und Trennlinien (Straßen, Bahn, Flüsse) je Pixel
│  │  ├─ regions.js  Raster → Orte: Blöcke zwischen den Straßen, Krümel verschmelzen, Riesen teilen,
│  │  │              Nachbarn, Gelände, Umrisse, Namen („Häuser an der Lindenstraße“); Fantasie-Gegend
│  │  ├─ render.js   gezeichneter Stadtplan: Orte mit Mustern, Straßen mit Namen, Wahrzeichen, Nummern
│  │  └─ build.js    Ausschnitt laden/verschieben, Brett bauen
│  ├─ net/
│  │  ├─ transport.js  gemeinsames Interface
│  │  ├─ local.js      lokaler Transport für Tests
│  │  ├─ trystero.js   Online-Transport mit zuverlässiger Zustellung und Wiederverbinden
│  │  ├─ bc-room.js    Test-Hook: ?net=bc verbindet zwei Tabs per BroadcastChannel
│  │  ├─ protocol.js   Nachrichtentypen und Prüfung
│  │  └─ commit.js     Hash-Commitment und Nachprüfung
│  ├─ ui/          Screens: Start, Erstellen, Lobby/Beitreten, Verstecken, Spiel, Ende;
│  │               feedback.js: Geräusche (WebAudio), Animationen über dem Brett
│  ├─ app/         Online-Ablauf
│  └─ main.js
├─ assets/         generierte Grafiken (webp) + manifest.json
├─ vendor/         trystero.js, qrcode.js (gebündelt, MIT)
├─ scripts/        generate-assets.mjs + prompts.json (OpenRouter)
└─ test/           node:test – Engine, Karte, Netz
```

Die Engine kennt nur das Transport-Interface; die Tests verbinden zwei Engines über den lokalen Transport.

## Entwickeln

```sh
cd tools/tierversteck
npm test                 # node --test, keine Abhängigkeiten nötig
npm run serve            # http://localhost:8000/tools/tierversteck/
```

Online-Modus ohne Relays testen: `…/tools/tierversteck/?net=bc` in zwei Tabs öffnen.

## Grafiken

Die Sticker (Tiere, Pfote, Staubwolke, Titelbild) wurden mit OpenRouter erzeugt (`google/gemini-3.1-flash-image`, Prompts in `scripts/prompts.json`) und liegen als WebP in `assets/`. Die App nutzt alles, was in `assets/manifest.json` steht; fehlt eine Grafik, zeichnet sie eigene Formen mit Emoji.

Neu erzeugen:

```sh
echo "OPENROUTER_API_KEY=sk-or-…" > .env          # bleibt lokal (.gitignore)
node scripts/generate-assets.mjs --list-models    # Bildmodell aussuchen
node scripts/generate-assets.mjs                  # Varianten nach scripts/out/
python3 scripts/postprocess-assets.py <ordner> assets   # freistellen, skalieren, WebP
```

Die Tier-Sticker werden auf die Bounding Box der Grundform gelegt, mit der Form-Maske beschnitten und mitgedreht bzw. -gespiegelt. Hund (3:1) und Pferd (Hochformat) haben deshalb passende Seitenverhältnisse.

## Lizenzen

Kartendaten © OpenStreetMap-Mitwirkende (ODbL). Gebündelte Bibliotheken siehe `vendor/README.md`.
