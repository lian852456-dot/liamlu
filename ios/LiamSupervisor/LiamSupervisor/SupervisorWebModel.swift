import Foundation
import WebKit

@MainActor
final class SupervisorWebModel: ObservableObject {
    @Published var isLoading = true
    @Published var errorMessage: String?

    let webView: WKWebView
    private var didLoadInitialURL = false

    init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.allowsAirPlayForMediaPlayback = false
        configuration.mediaTypesRequiringUserActionForPlayback = .all

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
    }

    func loadInitialURLIfNeeded() {
        guard !didLoadInitialURL else { return }
        didLoadInitialURL = true
        loadApp()
    }

    func loadApp() {
        errorMessage = nil
        isLoading = true
        let request = URLRequest(
            url: AppConfig.appURL,
            cachePolicy: .reloadRevalidatingCacheData,
            timeoutInterval: 30
        )
        webView.load(request)
    }

    func refresh() {
        errorMessage = nil
        if webView.url == nil {
            loadApp()
        } else {
            webView.reloadFromOrigin()
        }
    }

    func resumeIfNeeded() {
        if errorMessage != nil || webView.url == nil {
            loadApp()
        }
    }
}
