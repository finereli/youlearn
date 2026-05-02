import AppKit
import WebKit

/// Experimental player that embeds youtube.com directly in a WKWebView.
/// CSS-hides chrome (masthead, sidebar, comments, recommendations,
/// auto-next overlay, creator end-screens) and bridges video playback
/// events back to native code for resume tracking + playlist advance.
final class BrowserPlayerViewController: NSViewController, WKScriptMessageHandler, WKNavigationDelegate {
    private var webView: WKWebView!
    private let placeholder = NSTextField(labelWithString: "Pick a video from the sidebar.")
    private let loadingOverlay = NSView()
    private let spinner = NSProgressIndicator()

    private var currentContext: PlayContext?

    override func loadView() {
        let v = NSView()

        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        let ucc = WKUserContentController()
        ucc.add(self, name: "ylevent")
        ucc.addUserScript(WKUserScript(source: cssInjector, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        ucc.addUserScript(WKUserScript(source: bridgeScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        config.userContentController = ucc

        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        webView.setValue(false, forKey: "drawsBackground")  // Don't flash white before page paints.
        webView.isHidden = true

        placeholder.translatesAutoresizingMaskIntoConstraints = false
        placeholder.alignment = .center
        placeholder.textColor = .secondaryLabelColor

        loadingOverlay.translatesAutoresizingMaskIntoConstraints = false
        loadingOverlay.wantsLayer = true
        loadingOverlay.layer?.backgroundColor = NSColor.black.cgColor
        loadingOverlay.isHidden = true

        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.style = .spinning
        spinner.controlSize = .large
        spinner.appearance = NSAppearance(named: .darkAqua)
        loadingOverlay.addSubview(spinner)

        v.addSubview(webView)
        v.addSubview(loadingOverlay)
        v.addSubview(placeholder)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: v.topAnchor),
            webView.leadingAnchor.constraint(equalTo: v.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: v.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: v.bottomAnchor),
            loadingOverlay.topAnchor.constraint(equalTo: v.topAnchor),
            loadingOverlay.leadingAnchor.constraint(equalTo: v.leadingAnchor),
            loadingOverlay.trailingAnchor.constraint(equalTo: v.trailingAnchor),
            loadingOverlay.bottomAnchor.constraint(equalTo: v.bottomAnchor),
            spinner.centerXAnchor.constraint(equalTo: loadingOverlay.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: loadingOverlay.centerYAnchor),
            placeholder.centerXAnchor.constraint(equalTo: v.centerXAnchor),
            placeholder.centerYAnchor.constraint(equalTo: v.centerYAnchor),
        ])
        self.view = v
    }

    func play(context: PlayContext) {
        currentContext = context
        placeholder.isHidden = true
        webView.isHidden = false
        loadingOverlay.isHidden = false
        loadingOverlay.alphaValue = 1
        spinner.startAnimation(nil)

        var comps = URLComponents(string: "https://www.youtube.com/watch")!
        var items = [URLQueryItem(name: "v", value: context.video.videoId)]
        // If resume is within 5s of the end, restart from 0. Loading a video at
        // its tail puts YouTube on the "Watch again" replay screen, which has a
        // different DOM (no #below / ytd-watch-metadata) — our chrome-hidden
        // check never trips, so the loading overlay would hang forever.
        var resume = Int(context.video.resumeSeconds)
        if let dur = context.video.duration, Double(resume) > dur - 5 { resume = 0 }
        if resume > 1 { items.append(URLQueryItem(name: "t", value: "\(resume)s")) }
        comps.queryItems = items
        webView.load(URLRequest(url: comps.url!))
    }

    private func dismissLoadingOverlay() {
        guard !loadingOverlay.isHidden else { return }
        loadingOverlay.isHidden = true
        spinner.stopAnimation(nil)
    }

    // MARK: - JS bridge

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard let dict = message.body as? [String: Any], let type = dict["type"] as? String else { return }
        switch type {
        case "ready":
            dismissLoadingOverlay()
        case "tick":
            let time = (dict["time"] as? Double) ?? 0
            persistResume(seconds: time)
        case "ended":
            persistResume(seconds: 0)
            advanceIfPlaylist()
        default:
            break
        }
    }

    private func persistResume(seconds: Double) {
        guard let ctx = currentContext, seconds.isFinite, seconds >= 1 else { return }
        if let plId = ctx.playlistId {
            Library.shared.setResume(playlistId: plId, videoId: ctx.video.videoId, seconds: seconds)
        } else {
            Library.shared.setResume(standaloneVideoId: ctx.video.videoId, seconds: seconds)
        }
    }

    private func advanceIfPlaylist() {
        guard let ctx = currentContext, let plId = ctx.playlistId, let idx = ctx.indexInPlaylist,
              let pl = Library.shared.data.playlists.first(where: { $0.id == plId }) else { return }
        let next = idx + 1
        guard next < pl.items.count else { return }
        Library.shared.setCurrentIndex(playlistId: plId, index: next)
        var nextVideo = pl.items[next]
        nextVideo.resumeSeconds = 0
        let newCtx = PlayContext(video: nextVideo, playlistId: plId, indexInPlaylist: next)
        play(context: newCtx)
    }
}

// MARK: - Injected scripts

/// CSS injection. Hides everything that isn't the player + immediate title.
/// Selectors are pinned at the time of writing — when YouTube renames a class
/// these go stale; refresh from DevTools and update `docs/browser-player.md`.
private let cssInjector = """
(function(){
  const css = `
    /* Dark page background — kills the white flash before YouTube paints. */
    html, body, ytd-app, #content { background: #000 !important; }
    /* Top chrome */
    ytd-masthead, #masthead-container, #masthead, tp-yt-app-header { display: none !important; }
    /* Right rail recommendations */
    #secondary, #related, ytd-watch-next-secondary-results-renderer { display: none !important; }
    /* Everything below the player: title, channel row, like/share/save,
       description, comments, merch/shorts shelves. */
    #below, ytd-watch-metadata, #above-the-fold, #middle-row, #bottom-row,
    ytd-comments, ytd-merch-shelf-renderer, ytd-shelf-renderer,
    ytd-rich-shelf-renderer, ytd-compact-video-renderer { display: none !important; }
    /* In-player end screens (creator-added thumbnails / subscribe buttons) */
    .ytp-ce-element, .ytp-ce-covering-overlay, .ytp-endscreen-content,
    .ytp-pause-overlay { display: none !important; }
    /* "Up next" auto-play overlay during last-seconds countdown */
    .ytp-autonav-endscreen-upnext-container, .ytp-upnext { display: none !important; }
    /* Mini-player + sticky cards */
    ytd-miniplayer { display: none !important; }
    /* Center the player on the page since the right rail is gone */
    ytd-watch-flexy[flexy] #primary, ytd-watch-flexy #primary { max-width: 100% !important; }
  `;
  const inject = () => {
    if (!document.head) { setTimeout(inject, 10); return; }
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  };
  inject();
})();
"""

/// Wires up the <video> element for resume tracking + end-of-video detection,
/// and posts a single 'ready' message to native once the page has settled
/// enough that our chrome-hiding CSS is definitively in effect — at which
/// point native dismisses the loading overlay.
///
/// "Settled" means: the <video> has loaded metadata AND the below-player
/// skeleton container (#below) exists in the DOM with computed display:none.
/// That second check is the important one — it guarantees YouTube has
/// constructed its custom elements and our CSS rules have matched, so there's
/// no chance of a chrome flash after we lift the overlay.
///
/// We also pause the video on 'ready' so it doesn't start playing while the
/// overlay is up — user clicks the player to start.
private let bridgeScript = """
(function(){
  let readyFired = false;
  let v = null;

  function chromeHidden() {
    const below = document.querySelector('#below') || document.querySelector('ytd-watch-metadata');
    if (!below) return false;
    return getComputedStyle(below).display === 'none';
  }

  function tryFireReady() {
    if (readyFired) return;
    if (!v || v.readyState < 1) return;
    if (!chromeHidden()) return;
    readyFired = true;
    try { window.webkit.messageHandlers.ylevent.postMessage({type: 'ready'}); } catch (e) {}
  }

  function bind(video) {
    v = video;
    v.addEventListener('loadedmetadata', tryFireReady);
    v.addEventListener('canplay', tryFireReady);
    v.addEventListener('ended', () => {
      try { window.webkit.messageHandlers.ylevent.postMessage({type: 'ended'}); } catch (e) {}
    });
    setInterval(() => {
      if (v && v.duration && !isNaN(v.duration)) {
        try {
          window.webkit.messageHandlers.ylevent.postMessage({
            type: 'tick',
            time: v.currentTime,
            duration: v.duration
          });
        } catch (e) {}
      }
    }, 5000);
  }

  function findVideo() {
    const found = document.querySelector('video');
    if (found) { bind(found); tryFireReady(); return; }
    setTimeout(findVideo, 100);
  }
  findVideo();

  // Poll for chrome-hidden in case CSS matched after the video was already ready.
  const poll = setInterval(() => {
    tryFireReady();
    if (readyFired) clearInterval(poll);
  }, 100);

  function disableAutoplay() {
    const t = document.querySelector('.ytp-autonav-toggle-button');
    if (!t) { setTimeout(disableAutoplay, 500); return; }
    if (t.getAttribute('aria-checked') === 'true') t.click();
  }
  setTimeout(disableAutoplay, 2000);
})();
"""

