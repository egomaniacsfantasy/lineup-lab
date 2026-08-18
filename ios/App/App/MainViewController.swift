import Capacitor
import UIKit

/**
 The web view's scroll behaviour is native, not CSS.

 Scroll indicators inside a WKWebView are drawn by its UIScrollView, so
 `::-webkit-scrollbar` and `scrollbar-width` never touch them — which is why
 hiding them in CSS measured correctly in a browser and changed nothing on the
 phone. The same is true of the rubber band and of sideways panning: the
 scroll view will pan and bounce regardless of what `overflow-x` says.

 Setting them here is the only place they can actually be set.
 */
class MainViewController: CAPBridgeViewController {
    /* Capacitor 8 does not discover plugins that live in the app target — it
       only knows the ones its own tooling registered, which is why the bridge
       answered "EspnAuth plugin is not implemented on ios" for a class that was
       demonstrably compiled into the binary. capacitorDidLoad is the hook for
       app-local plugins, and it has to happen here rather than in viewDidLoad
       because the bridge does not exist yet at that point. */
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        /* registerPluginType hands the bridge a type to instantiate, which did
           not publish a header for it. An instance is registered directly. */
        bridge?.registerPluginInstance(EspnAuthPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureScrollView()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // Capacitor rebuilds the web view on some lifecycle paths, so applying
        // this once at load is not enough to keep it applied.
        configureScrollView()
    }

    private func configureScrollView() {
        guard let scrollView = webView?.scrollView else { return }

        // The indicators are the clearest tell that this is a web view.
        scrollView.showsVerticalScrollIndicator = false
        scrollView.showsHorizontalScrollIndicator = false

        // Nothing in this app scrolls sideways, so the scroll view should not
        // offer to. alwaysBounceHorizontal off stops the pan that revealed
        // content past the right edge.
        scrollView.alwaysBounceHorizontal = false
        scrollView.bounces = false
        scrollView.bouncesZoom = false

        // The layout is fixed to the viewport and every scroller is a CSS one
        // inside it, so the outer scroll view has nothing legitimate to do.
        scrollView.contentInsetAdjustmentBehavior = .never

        // Pinch zoom on a native app reads as a broken web page.
        scrollView.minimumZoomScale = 1
        scrollView.maximumZoomScale = 1
        scrollView.pinchGestureRecognizer?.isEnabled = false
    }
}
