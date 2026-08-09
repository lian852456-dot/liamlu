import XCTest
@testable import LiamSupervisor

final class NavigationPolicyTests: XCTestCase {
    func testFormalOriginAndGoogleOAuthStayInWebView() {
        XCTAssertEqual(NavigationPolicy.disposition(for: URL(string: "https://lian852456-dot.github.io/liamlu/app.html")!), .webView)
        XCTAssertEqual(NavigationPolicy.disposition(for: URL(string: "https://accounts.google.com/o/oauth2/v2/auth")!), .webView)
    }

    func testExternalHTTPSUsesSystemBrowser() {
        XCTAssertEqual(NavigationPolicy.disposition(for: URL(string: "https://example.com")!), .externalBrowser)
    }

    func testHTTPAndUnknownSchemesAreBlocked() {
        XCTAssertEqual(NavigationPolicy.disposition(for: URL(string: "http://lian852456-dot.github.io/liamlu/app.html")!), .blocked)
        XCTAssertEqual(NavigationPolicy.disposition(for: URL(string: "javascript:alert(1)")!), .blocked)
    }
}
