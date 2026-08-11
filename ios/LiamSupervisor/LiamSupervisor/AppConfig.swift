import Foundation

enum AppConfig {
    static let appURL = URL(string: "https://lian852456-dot.github.io/liamlu/app.html?native=1&release=0fa45c6")!
    static let appHost = "lian852456-dot.github.io"

    // Only top-level OAuth navigation hosts needed by the existing Google sign-in flow.
    // GAS fetches are subresources and are not added as WebView navigation destinations.
    static let oauthHosts: Set<String> = [
        "accounts.google.com",
        "oauth2.googleapis.com"
    ]
}
