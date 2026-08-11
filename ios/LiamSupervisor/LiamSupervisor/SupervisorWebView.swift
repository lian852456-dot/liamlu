import SafariServices
import SwiftUI
import WebKit

struct SupervisorWebView: UIViewRepresentable {
    @ObservedObject var model: SupervisorWebModel

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    func makeUIView(context: Context) -> WKWebView {
        let webView = model.webView
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        Task { @MainActor in
            await Task.yield()
            model.loadInitialURLIfNeeded()
        }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        private enum ModelUpdate {
            case loading
            case finished
            case error(String)
            case processTerminated
        }

        private let model: SupervisorWebModel

        init(model: SupervisorWebModel) {
            self.model = model
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            switch NavigationPolicy.disposition(for: url) {
            case .webView:
                decisionHandler(.allow)
            case .externalBrowser:
                decisionHandler(.cancel)
                presentExternal(url)
            case .blocked:
                decisionHandler(.cancel)
                schedule(.error("已阻擋不安全或不受信任的連結。"))
            }
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            schedule(.loading)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            schedule(.finished)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            show(error)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            show(error)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            schedule(.processTerminated)
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url {
                switch NavigationPolicy.disposition(for: url) {
                case .webView:
                    webView.load(navigationAction.request)
                case .externalBrowser:
                    presentExternal(url)
                case .blocked:
                    schedule(.error("已阻擋不安全或不受信任的連結。"))
                }
            }
            return nil
        }

        private func show(_ error: Error) {
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
            schedule(.error("無法連線到 Liam 情報站。請確認網路後重試。"))
        }

        private func schedule(_ update: ModelUpdate) {
            Task { @MainActor [weak model] in
                await Task.yield()
                guard let model else { return }
                switch update {
                case .loading:
                    model.isLoading = true
                    model.errorMessage = nil
                case .finished:
                    model.isLoading = false
                    model.errorMessage = nil
                case .error(let message):
                    model.isLoading = false
                    model.errorMessage = message
                case .processTerminated:
                    model.isLoading = false
                    model.errorMessage = "App 內容程序已重新啟動，請重新載入。"
                }
            }
        }

        private func presentExternal(_ url: URL) {
            guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
                  let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else { return }

            if ["tel", "mailto"].contains(url.scheme?.lowercased() ?? "") {
                UIApplication.shared.open(url)
                return
            }

            var presenter = root
            while let presented = presenter.presentedViewController { presenter = presented }
            presenter.present(SFSafariViewController(url: url), animated: true)
        }
    }
}
