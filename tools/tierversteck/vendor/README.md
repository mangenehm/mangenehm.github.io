# Vendored libraries

Die Seite hat keinen Build-Schritt; externe Bibliotheken liegen deshalb als
fertige ES-Module hier (gebündelt mit esbuild, minifiziert).

| Datei | Paket | Lizenz |
| --- | --- | --- |
| `trystero.js` | `trystero@0.26.0` (Nostr-Strategie, inkl. `@noble/secp256k1`) | MIT, siehe `LICENSE-trystero.txt` |
| `qrcode.js` | `qrcode-generator@2.0.4` | MIT, siehe `LICENSE-qrcode-generator.txt` |

Neu erzeugen:

```sh
npm i trystero@0.26.0 qrcode-generator@2.0.4 esbuild
echo "export {joinRoom, selfId} from 'trystero';" > entry.js
npx esbuild entry.js --bundle --format=esm --minify --target=es2020 --legal-comments=eof --outfile=trystero.js
echo "import q from 'qrcode-generator'; export default q;" > qr.js
npx esbuild qr.js --bundle --format=esm --minify --legal-comments=eof --outfile=qrcode.js
```
