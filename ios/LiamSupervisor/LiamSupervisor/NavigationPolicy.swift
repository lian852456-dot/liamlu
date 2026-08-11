import Foundation

enum NavigationDisposition: Equatable {
    case webView
    case externalBrowser
    case blocked
}

enum NavigationPolicy {
    private static let appPath = "/liamlu/app.html"

    static func disposition(for url: URL) -> NavigationDisposition {
        if url.scheme == "about" && url.absoluteString == "about:blank" {
            return .webView
        }

        guard let scheme = url.scheme?.lowercased() else {
            return .blocked
        }

        if ["tel", "mailto"].contains(scheme) {
            return .externalBrowser
        }

        guard scheme == "https", let host = url.host?.lowercased() else {
            return .blocked
        }

        if host == AppConfig.appHost {
            return url.path == appPath ? .webView : .externalBrowser
        }

        if AppConfig.oauthHosts.contains(host) {
            return .webView
        }

        return .externalBrowser
    }
}
