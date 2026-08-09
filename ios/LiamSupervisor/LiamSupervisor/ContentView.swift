import SwiftUI

struct ContentView: View {
    @ObservedObject var model: SupervisorWebModel
    @StateObject private var network = NetworkMonitor()

    var body: some View {
        ZStack {
            Color(red: 0.01, green: 0.06, blue: 0.11).ignoresSafeArea()
            SupervisorWebView(model: model)
                .ignoresSafeArea(edges: .bottom)

            if model.isLoading {
                loadingCard
            }

            if !network.isConnected || model.errorMessage != nil {
                errorCard
            }

            Button(action: model.refresh) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 42, height: 42)
                    .background(.ultraThinMaterial, in: Circle())
            }
            .accessibilityLabel("重新整理")
            .padding(.top, 8)
            .padding(.trailing, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        }
    }

    private var loadingCard: some View {
        VStack(spacing: 12) {
            ProgressView().tint(.cyan)
            Text("正在載入 Liam 情報站")
                .font(.headline)
        }
        .padding(24)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
    }

    private var errorCard: some View {
        VStack(spacing: 12) {
            Image(systemName: network.isConnected ? "exclamationmark.triangle.fill" : "wifi.slash")
                .foregroundStyle(.orange)
                .font(.system(size: 28))
            Text(network.isConnected ? (model.errorMessage ?? "載入失敗") : "目前沒有網路連線")
                .multilineTextAlignment(.center)
            Button("重試", action: model.loadApp)
                .buttonStyle(.borderedProminent)
                .tint(.cyan)
        }
        .padding(24)
        .frame(maxWidth: 300)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
    }
}
