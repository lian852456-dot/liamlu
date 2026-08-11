import Foundation

@main
struct NavigationPolicySmoke {
    static func main() {
        precondition(NavigationPolicy.disposition(for: AppConfig.appURL) == .webView)
        precondition(NavigationPolicy.disposition(for: URL(string: "https://accounts.google.com/o/oauth2/v2/auth")!) == .webView)
        precondition(NavigationPolicy.disposition(for: URL(string: "https://example.com")!) == .externalBrowser)
        precondition(NavigationPolicy.disposition(for: URL(string: "https://lian852456-dot.github.io/liamlu/kpi.html")!) == .externalBrowser)
        precondition(NavigationPolicy.disposition(for: URL(string: "https://lian852456-dot.github.io/liamlu/index.html")!) == .externalBrowser)
        precondition(NavigationPolicy.disposition(for: URL(string: "https://lian852456-dot.github.io/liamlu/patrol.html")!) == .externalBrowser)
        precondition(NavigationPolicy.disposition(for: URL(string: "tel:0912345678")!) == .externalBrowser)
        precondition(NavigationPolicy.disposition(for: URL(string: "http://lian852456-dot.github.io/liamlu/app.html")!) == .blocked)
        precondition(NavigationPolicy.disposition(for: URL(string: "javascript:alert(1)")!) == .blocked)
        precondition(NavigationPolicy.disposition(for: URL(string: "file:///tmp/test.html")!) == .blocked)
        print("NavigationPolicy smoke PASS")
    }
}
