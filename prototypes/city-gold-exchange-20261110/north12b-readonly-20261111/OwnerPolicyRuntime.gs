// Reuse the original approved B roster lifetime. Never renew it here.
// Called inside CityEmployeeBridge's existing owner transaction.
function cityOwnerPolicyRead_() {
  var config = privateDashboardCreateGasBStore_({}).config();
  var a = config.authority;
  return {schema:'city-owner-policy/v1',
    id:'north12b-owner-'+a.sourceHash.slice(0,32),
    generation:a.version,enabled:true,
    notBefore:a.effectiveAt,validUntil:a.validUntil};
}
