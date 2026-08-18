import Capacitor
import Foundation
import UIKit
import WebKit

/**
 ESPN sign-in, natively.

 ESPN keeps a league session in `espn_s2`, which is HttpOnly: no page script can
 read it, which is why this needed either a browser extension or a server
 driving a headless browser. Neither is good. The extension needs a computer and
 a store listing; the headless browser needs the user's Disney password to reach
 our servers, and it was slow and memory hungry enough to fail outright.

 A WKWebView we present ourselves has neither problem. The user signs in on
 ESPN's own page, so the password never touches us at all, and afterwards the
 cookie is readable from `WKHTTPCookieStore` because that store is native and
 not subject to the HttpOnly rule that binds JavaScript.

 The web build cannot do this, so the connector stays for browsers.
 */
@objc(EspnAuthPlugin)
public class EspnAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "EspnAuthPlugin"
    public let jsName = "EspnAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    private var presented: EspnAuthViewController?

    @objc func signIn(_ call: CAPPluginCall) {
        let leagueId = call.getString("leagueId") ?? ""
        let season = call.getString("season") ?? ""

        guard !leagueId.isEmpty else {
            call.reject("A league id is required.")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self, let bridge = self.bridge,
                  let host = bridge.viewController else {
                call.reject("No view controller to present from.")
                return
            }

            let controller = EspnAuthViewController(leagueId: leagueId, season: season)
            controller.onFinish = { [weak self] result in
                self?.presented = nil
                switch result {
                case let .success(espnS2, swid):
                    call.resolve(["status": "ok", "espnS2": espnS2, "swid": swid])
                case .cancelled:
                    call.resolve(["status": "cancelled"])
                case let .failed(reason):
                    call.resolve(["status": "failed", "reason": reason])
                }
            }

            self.presented = controller
            let nav = UINavigationController(rootViewController: controller)
            nav.modalPresentationStyle = .formSheet
            host.present(nav, animated: true)
        }
    }
}

enum EspnAuthResult {
    case success(espnS2: String, swid: String)
    case cancelled
    case failed(reason: String)
}

final class EspnAuthViewController: UIViewController, WKNavigationDelegate {
    var onFinish: ((EspnAuthResult) -> Void)?

    private let leagueId: String
    private let season: String
    private var webView: WKWebView!
    private var settled = false
    private var pollTimer: Timer?

    init(leagueId: String, season: String) {
        self.leagueId = leagueId
        self.season = season
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Sign in to ESPN"
        view.backgroundColor = UIColor(red: 0.05, green: 0.06, blue: 0.07, alpha: 1)

        navigationItem.leftBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .cancel,
            target: self,
            action: #selector(cancelTapped)
        )

        // The default store is the one Capacitor's own web view uses, so a
        // session established here is already in place for everything after.
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])

        // Landing on the league itself means ESPN sends the user to sign in and
        // then returns them here, so the cookie is set exactly when we arrive.
        var components = URLComponents(string: "https://fantasy.espn.com/football/league")!
        components.queryItems = [URLQueryItem(name: "leagueId", value: leagueId)]
        if !season.isEmpty {
            components.queryItems?.append(URLQueryItem(name: "seasonId", value: season))
        }
        webView.load(URLRequest(url: components.url!))

        // Some ESPN sign-in steps finish without a navigation the delegate sees,
        // so poll as well rather than rely on one signal.
        pollTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            self?.checkForSession()
        }
    }

    deinit {
        pollTimer?.invalidate()
    }

    @objc private func cancelTapped() {
        finish(.cancelled)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        checkForSession()
    }

    private func checkForSession() {
        guard !settled else { return }
        webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
            guard let self, !self.settled else { return }

            var espnS2: String?
            var swid: String?
            for cookie in cookies where cookie.domain.contains("espn.com") {
                if cookie.name == "espn_s2" { espnS2 = cookie.value }
                if cookie.name.uppercased() == "SWID" { swid = cookie.value }
            }

            guard let espnS2, let swid, !espnS2.isEmpty, !swid.isEmpty else { return }
            self.finish(.success(espnS2: espnS2, swid: swid))
        }
    }

    private func finish(_ result: EspnAuthResult) {
        guard !settled else { return }
        settled = true
        pollTimer?.invalidate()
        pollTimer = nil
        let handler = onFinish
        dismiss(animated: true) { handler?(result) }
    }
}
