The local PPTX reader bundles the browser Blob/ZIP reader from @zip.js/zip.js 2.25.0 (BSD-3-Clause) and the incremental SHA-256 implementation from @noble/hashes 2.4.0 (MIT). Their licenses are included alongside the bundle.

To reproduce the bundle with these exact packages and esbuild 0.25.12 installed, create an entry module containing

```js
export {BlobReader, ZipReader, Uint8ArrayWriter} from '@zip.js/zip.js/lib/zip-core-native.js';
export {sha256} from '@noble/hashes/sha2.js';
```

Run esbuild on that module with `--bundle --format=esm --target=es2022 --minify --legal-comments=inline --outfile=reader-2.25.0-2.4.0.mjs`.
