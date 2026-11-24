importScripts('./assets/vendor/xlsx.full.min.js');
self.onmessage = async ({data}) => {
  try {
    const {parseWorkbook} = await import('./op-series-core.mjs');
    const lib = self.XLSX;
    const book = lib.read(data, {sheets:['OP全系列','全機款','個人'],cellFormula:false,cellHTML:false,cellText:false});
    self.postMessage({report:parseWorkbook(book,lib)});
  } catch (error) { self.postMessage({error:error.message}); }
};
