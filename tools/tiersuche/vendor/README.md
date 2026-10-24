# Vendored libraries

Die Seite hat keinen Build-Schritt; externe Bibliotheken liegen deshalb als
fertige ES-Module hier (gebündelt mit esbuild, minifiziert).

| Datei | Paket | Lizenz |
| --- | --- | --- |
| `trystero.js` | `trystero@0.26.0` (Nostr-Strategie, inkl. `@noble/secp256k1`) | MIT, siehe `LICENSE-trystero.txt` |
| `qrcode.js` | `qrcode-generator@2.0.4` | MIT, siehe `LICENSE-qrcode-generator.txt` |
| `vector-tile.js` | `pbf@4.0.1` + `@mapbox/vector-tile@2.0.3` | BSD-3-Clause, siehe `LICENSE-pbf.txt`, `LICENSE-vector-tile.txt` |

Neu erzeugen:

```sh
npm i trystero@0.26.0 qrcode-generator@2.0.4 esbuild
echo "export {joinRoom, selfId} from 'trystero';" > entry.js
npx esbuild entry.js --bundle --format=esm --minify --target=es2020 --legal-comments=eof --outfile=trystero.js
echo "import q from 'qrcode-generator'; export default q;" > qr.js
npx esbuild qr.js --bundle --format=esm --minify --legal-comments=eof --outfile=qrcode.js
npm i pbf@4.0.1 @mapbox/vector-tile@2.0.3
echo "export { default as Pbf } from 'pbf'; export { VectorTile } from '@mapbox/vector-tile';" > vt.js
npx esbuild vt.js --bundle --format=esm --minify --target=es2020 --legal-comments=eof --outfile=vector-tile.js
```
