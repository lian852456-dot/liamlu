# In-browser OCR assets

The Operations Brief reads these static assets from the site's origin on the first local OCR request. Source images and results stay in browser memory. These files contain public software and language models.

| Asset | Upstream | License |
| --- | --- | --- |
| `tesseract.min.js`, `worker.min.js` | [Tesseract.js 7.0.0](https://github.com/naptha/tesseract.js/tree/v7.0.0) | Apache-2.0, with bundled third-party notices next to the assets |
| `tesseract-core-lstm.wasm.js` | [Tesseract.js-core 7.0.0](https://github.com/naptha/tesseract.js-core/tree/v7.0.0) | Apache-2.0 |
| `chi_tra.traineddata.gz`, `eng.traineddata.gz` | [tessdata_fast 8741641](https://github.com/tesseract-ocr/tessdata_fast/tree/87416418657359cb625c412a48b6e1d6d41c29bd), compressed with `gzip -9n` | Apache-2.0 |

SHA-256 of the served runtime and model files

```text
000c27d9cd0def655f77b36c72a389c0ab13793aa31cb4d7aab56d09c0afbc7e  tesseract.min.js
576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d  worker.min.js
eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680  tesseract-core-lstm.wasm.js
52ce5cdc5080a5847a02635b18a676fe41676840a86bd27e99954c24df9cd895  chi_tra.traineddata.gz
2a66ec904bc0e7657b27e200a874c01e1bc8a58b756cbbaa9afbae736fa50edc  eng.traineddata.gz
```
