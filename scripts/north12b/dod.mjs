export const isNumber = value => typeof value==='number' && Number.isFinite(value);
export function comparison(current, previous, sameMonth, validBaseline=true) {
  if(!sameMonth) return {value:null,note:'跨月，暫不比較'};
  if(!validBaseline || !isNumber(previous)) return {value:null,note:'前日無有效資料，暫不比較'};
  if(!isNumber(current)) return {value:null,note:'本日尚未有資料，暫不比較'};
  return {value:current-previous,note:''};
}
