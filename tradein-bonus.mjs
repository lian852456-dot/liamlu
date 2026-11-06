export const BONUS_MONTH = '2026-11';

const SALES_RATES = {specified:235, general:176};
const MANAGER_RATES = {specified:60, general:45};
const amount = new Intl.NumberFormat('zh-TW');

function category(model){
  const name=model.trim();
  if(/^(?:twm|taiwan\s*mobile)\s*[- ]?a32\b/i.test(name))return 'excluded';
  // The public model abbreviation can omit the brand of a Galaxy A32.
  if(/^(?:a32\b|(?:unknown|n\/?a|iphone|mac|[-.]+)$)/i.test(name)||!name)return 'pending';
  if(/^(?:i(?:phone\s*)?(?:15|16|17)(?:\s*(?:pro\s*max|pro|plus|pm|p|e|\+))?|i(?:phone\s*)?air)(?=$|[ .(/-])/i.test(name) ||
     /^(?:macbook(?:\s*(?:air|pro))?|imac(?:\s*pro)?|mac\s*(?:mini|studio|pro))(?=$|[ .(/-])/i.test(name))return 'specified';
  return 'general';
}

function estimate(actual, models, rates){
  const counts={specified:0,general:0,excluded:0,pending:0};
  for(const {model,units} of models)counts[category(model)]+=units;
  const accounted=Object.values(counts).reduce((sum,units)=>sum+units,0);
  if(accounted>actual)return null;
  counts.pending+=actual-accounted;
  const min=counts.specified*rates.specified+counts.general*rates.general;
  return {...counts,min,max:min+counts.pending*rates.specified};
}

export function estimatePersonBonus(person){
  if(person.actual_units===null)return null;
  return estimate(person.actual_units, person.recovered_models??[], SALES_RATES);
}

export function estimateStoreBonus(store, people){
  // Outgoing support is recorded at the person's home store, but the public
  // aggregate does not identify which of that person's models left the store.
  const models=store.support_out_units?[]:people.filter(person=>person.store===store.store)
    .flatMap(person=>person.recovered_models??[]);
  return estimate(store.actual_units, models, MANAGER_RATES);
}

export function formatBonusEstimate(estimate){
  if(!estimate)return '待核';
  const {min,max}=estimate;
  return min===max?`NT$${amount.format(min)}`:`NT$${amount.format(min)}–${amount.format(max)}`;
}
