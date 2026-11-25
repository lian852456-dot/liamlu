// Build a standalone report from display fields only. Native details work offline.
export function section(label, collapsible = false) {
  const container = document.createElement(collapsible ? 'details' : 'section');
  const heading = document.createElement(collapsible ? 'summary' : 'h2');
  heading.textContent = label;
  container.append(heading);
  return container;
}

export function table(headers) {
  const wrapper = document.createElement('div');
  wrapper.className = 'scroll';
  const grid = document.createElement('table');
  grid.className = 'overview';
  wrapper.append(grid);
  const heading = grid.createTHead().insertRow();
  for (const label of headers) {
    const th = document.createElement('th');
    th.textContent = label;
    heading.append(th);
  }
  return {wrapper, body: grid.createTBody()};
}

export function downloadReadonly(title, scope, period, cutoff, sections) {
  const doc = document.implementation.createHTMLDocument(title + '｜' + scope + '唯讀版');
  doc.documentElement.lang = 'zh-Hant';
  for (const attrs of [
    {charset:'utf-8'},
    {name:'viewport', content:'width=device-width, initial-scale=1'},
    {'http-equiv':'Content-Security-Policy', content:"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"}
  ]) {
    const meta = doc.createElement('meta');
    for (const [key, value] of Object.entries(attrs)) meta.setAttribute(key,value);
    doc.head.append(meta);
  }
  const style = doc.createElement('style');
  style.textContent = Array.from(document.styleSheets, sheet =>
    Array.from(sheet.cssRules, rule => rule.cssText).join('\n')).join('\n') +
    '\nmain > section, main > details, section > details {margin:18px 0} summary{cursor:pointer;font-weight:700;padding:8px 0}';
  doc.head.append(style);
  const main = doc.createElement('main');
  const header = doc.createElement('header');
  const titleNode = doc.createElement('h1');
  titleNode.textContent = title + '｜' + scope;
  header.append(titleNode);
  const subtitle = doc.createElement('p');
  subtitle.textContent = '門市追蹤唯讀版 ｜ ' + period;
  main.append(header, subtitle, ...sections);
  doc.body.append(main);
  const blob = new Blob(['<!doctype html>\n', doc.documentElement.outerHTML], {type:'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '北一二B_' + title + '_' + scope + '_唯讀版_' + cutoff.replaceAll('-','') + '.html';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
