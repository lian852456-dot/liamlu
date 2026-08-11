import XCTest
@testable import LiamSupervisor

final class NavigationPolicyTests: XCTestCase {
    func testFormalOriginAndGoogleOAuthStayInWebView() {
        XCTAssertEqual(NavigationPolicy.disposition(for: URL(string: "https://lian852456-dot.github.io/liamlu/app.html")!), .webView)
        XCTAssertEqual(NavigationPolicy.disposition(for: URL(string: "https://accounts.google.com/o/oauth2/v2/auth")!), .webView)
    }

    func testExternalHTTPSUsesSystemBrowser() {
        XCTAssertEqual(NavigationPolicy.disposition(for: URL(string: "https://example.com")!), .externalBrowser)
        XCTAssertEqual(NavigationPolicy.disposition(for: URL(string: "https://lian852456-dot.github.io/liamlu/index.html")!), .externalBrowser)
        XCTAssertEqual(NavigationPolicy.disposition(for: URL(string: "https://lian852456-dot.github.io/liamlu/kpi.html")!), .externalBrowser)
        XCTAssertEqual(NavigationPolicy.disposition(for: URL(string: "https://lian852456-dot.github.io/liamlu/patrol.html")!), .externalBrowser)
        XCTAssertEqual(NavigationPolicy.disposition(for: URL(string: "tel:0912345678")!), .externalBrowser)
        XCTAssertEqual(NavigationPolicy.disposition(for: URL(string: "mailto:test@example.com")!), .externalBrowser)
    }

    func testHTTPAndUnknownSchemesAreBlocked() {
        XCTAssertEqual(NavigationPolicy.disposition(for: URL(string: "http://lian852456-dot.github.io/liamlu/app.html")!), .blocked)
        XCTAssertEqual(NavigationPolicy.disposition(for: URL(string: "javascript:alert(1)")!), .blocked)
        XCTAssertEqual(NavigationPolicy.disposition(for: URL(string: "file:///tmp/test.html")!), .blocked)
        XCTAssertEqual(NavigationPolicy.disposition(for: URL(string: "custom-scheme://example")!), .blocked)
    }
}
