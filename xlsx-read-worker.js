// Web Worker: runs XLSX.read off the main thread so large uploads do not
// freeze the page. It uses the same SheetJS build and the same options as
// the caller, and posts the workbook back unchanged (structured clone), so
// every parser and calculation keeps running on identical input.
/* global XLSX */
'use strict';
importScripts('assets/vendor/xlsx.full.min.js');

self.onmessage = event => {
  const { id, data, options } = event.data || {};
  try {
    const workbook = XLSX.read(data, options || {});
    self.postMessage({ id, ok: true, workbook });
  } catch (error) {
    self.postMessage({ id, ok: false, message: String((error && error.message) || error) });
  }
};
