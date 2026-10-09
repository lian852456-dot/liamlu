// Owner-local adapter derived from the native store/provider wiring.
// No RPC, peer transport, B/password endpoint, implicit state initialization,
// settings values, resource creation, triggers or authority extension.
let privateDashboardOwnerLocalProviderInstance_ = null;
function privateDashboardAuthNativeProvider_() {
  privateDashboardGasAuthGate_({});
  privateDashboardRequireAuthOwner_();
  if (!privateDashboardOwnerLocalProviderInstance_) {
    const store = privateDashboardCreateGasAuthStore_({});
    privateDashboardOwnerLocalProviderInstance_ = privateDashboardCreateGasAuthProvider_({store:store});
  }
  return privateDashboardOwnerLocalProviderInstance_;
}
