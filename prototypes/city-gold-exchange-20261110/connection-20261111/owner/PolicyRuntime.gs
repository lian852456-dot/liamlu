// Candidate host hook only: include readPolicy: cityOwnerPolicyRead_ in the
// existing CityEmployeeBridge.create factory. No action or policy writer added.
function cityOwnerPolicyRead_() {
  var raw = privateDashboardProperties().getProperty('CITY_OWNER_POLICY_V1');
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch (_) { throw Error('CITY_LINK_POLICY_INVALID'); }
}
