import AppKit
import AVKit
import AVFoundation

final class PlayerViewController: NSViewController {
    private let playerView = AVPlayerView()
    private let progressOverlay = ProgressOverlay()
    private let placeholder = NSTextField(labelWithString: "Pick a video from the sidebar.")
    private let subtitleLabel = SubtitleLabel()

    private var currentContext: PlayContext?
    private var currentDownload: Process?
    private var activeToken: UUID?
    private var timeObserver: Any?
    private var subtitleObserver: Any?
    private var endObserver: Any?
    private var keyMonitor: Any?
    private var subtitleBottomConstraint: NSLayoutConstraint!
    private var subtitleMaxWidthConstraint: NSLayoutConstraint!
    private var videoBoundsObserver: NSKeyValueObservation?

    private var cues: [SubtitleCue] = []
    private var subtitlesEnabled: Bool = true

    override func loadView() {
        let v = NSView()

        playerView.translatesAutoresizingMaskIntoConstraints = false
        playerView.controlsStyle = .floating
        playerView.showsFullScreenToggleButton = true
        playerView.isHidden = true

        progressOverlay.translatesAutoresizingMaskIntoConstraints = false
        progressOverlay.isHidden = true

        placeholder.translatesAutoresizingMaskIntoConstraints = false
        placeholder.alignment = .center
        placeholder.textColor = .secondaryLabelColor

        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        subtitleLabel.isHidden = true

        v.addSubview(playerView)
        v.addSubview(subtitleLabel)
        v.addSubview(progressOverlay)
        v.addSubview(placeholder)

        subtitleBottomConstraint = subtitleLabel.bottomAnchor.constraint(equalTo: playerView.bottomAnchor, constant: -140)
        subtitleMaxWidthConstraint = subtitleLabel.widthAnchor.constraint(lessThanOrEqualToConstant: 800)

        NSLayoutConstraint.activate([
            playerView.topAnchor.constraint(equalTo: v.topAnchor),
            playerView.leadingAnchor.constraint(equalTo: v.leadingAnchor),
            playerView.trailingAnchor.constraint(equalTo: v.trailingAnchor),
            playerView.bottomAnchor.constraint(equalTo: v.bottomAnchor),
            subtitleLabel.centerXAnchor.constraint(equalTo: playerView.centerXAnchor),
            subtitleBottomConstraint,
            subtitleMaxWidthConstraint,
            subtitleLabel.leadingAnchor.constraint(greaterThanOrEqualTo: v.leadingAnchor, constant: 24),
            subtitleLabel.trailingAnchor.constraint(lessThanOrEqualTo: v.trailingAnchor, constant: -24),
            progressOverlay.centerXAnchor.constraint(equalTo: v.centerXAnchor),
            progressOverlay.centerYAnchor.constraint(equalTo: v.centerYAnchor),
            progressOverlay.widthAnchor.constraint(equalToConstant: 360),
            placeholder.centerXAnchor.constraint(equalTo: v.centerXAnchor),
            placeholder.centerYAnchor.constraint(equalTo: v.centerYAnchor),
        ])
        self.view = v

        // AVPlayerView fills the window but the actual video frame is letterboxed
        // inside it. Track videoBounds (KVO-compliant) and float the subtitle just
        // above the bottom of the rendered video, regardless of window aspect.
        videoBoundsObserver = playerView.observe(\.videoBounds, options: [.new, .initial]) { [weak self] view, _ in
            self?.updateSubtitlePosition(videoBounds: view.videoBounds, playerHeight: view.bounds.height)
        }
    }

    private func updateSubtitlePosition(videoBounds: NSRect, playerHeight: CGFloat) {
        // playerView is non-flipped; videoBounds.minY is the bottom of the video
        // measured from the bottom of the player view. We anchor subtitle.bottom
        // to playerView.bottom, so a positive offset = above bottom of video.
        let inset: CGFloat = 30
        let offset = -(videoBounds.minY + inset)
        let minOffset = -(playerHeight - 60)
        subtitleBottomConstraint.constant = max(offset, minOffset)
        // Cap subtitle width at 70% of the rendered video width so long cues
        // wrap to two lines instead of stretching across the whole picture.
        subtitleMaxWidthConstraint.constant = max(200, videoBounds.width * 0.7)
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        installKeyMonitor()
    }

    override func viewWillDisappear() {
        super.viewWillDisappear()
        if let m = keyMonitor { NSEvent.removeMonitor(m); keyMonitor = nil }
    }

    private func installKeyMonitor() {
        guard keyMonitor == nil else { return }
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self = self, let win = self.view.window, event.window === win else { return event }
            if event.charactersIgnoringModifiers?.lowercased() == "c", !self.cues.isEmpty {
                self.subtitlesEnabled.toggle()
                if !self.subtitlesEnabled { self.subtitleLabel.setText("") }
                return nil
            }
            return event
        }
    }

    func play(context: PlayContext) {
        teardownPlayer()
        currentDownload?.terminate()
        currentDownload = nil
        if let prior = currentContext?.video.videoId {
            YTDLP.deletePartialFiles(videoId: prior, in: VideoCache.dir)
        }

        currentContext = context
        placeholder.isHidden = true

        let token = UUID()
        activeToken = token

        if let cached = VideoCache.cachedFile(videoId: context.video.videoId) {
            startPlayback(url: cached)
        } else {
            startDownload(for: context, token: token)
        }
    }

    private func startDownload(for context: PlayContext, token: UUID) {
        playerView.isHidden = true
        progressOverlay.isHidden = false
        progressOverlay.set(title: context.video.title, percent: 0, status: "Starting…")
        progressOverlay.setIndeterminate(false)

        currentDownload = YTDLP.download(
            videoId: context.video.videoId,
            to: VideoCache.dir,
            progress: { [weak self] pct, dl, total, speed in
                guard let self = self, self.activeToken == token else { return }
                let totalStr = total > 0 ? VideoCache.formatBytes(total) : "?"
                let dlStr = VideoCache.formatBytes(dl)
                self.progressOverlay.set(title: context.video.title, percent: pct, status: "\(dlStr) / \(totalStr) — \(speed)")
            },
            completion: { [weak self] result in
                guard let self = self else { return }
                let stillActive = self.activeToken == token
                if stillActive { self.currentDownload = nil }
                switch result {
                case .success(let url):
                    VideoCache.notifyChanged()
                    guard stillActive else { return }
                    self.startPlayback(url: url)
                case .failure(let err):
                    guard stillActive else { return }
                    self.progressOverlay.set(title: context.video.title, percent: 0, status: "Failed — see error window")
                    ErrorReporter.show(title: "Download failed: \(context.video.title)", error: err)
                }
            }
        )
    }

    private func startPlayback(url fileURL: URL) {
        progressOverlay.isHidden = true
        playerView.isHidden = false

        let item = AVPlayerItem(url: fileURL)
        let player = AVPlayer(playerItem: item)
        playerView.player = player

        loadSubtitles(forVideoId: currentContext?.video.videoId)

        let resume = currentContext?.video.resumeSeconds ?? 0
        if resume > 1 {
            let target = CMTime(seconds: resume, preferredTimescale: 600)
            player.seek(to: target, toleranceBefore: .zero, toleranceAfter: .positiveInfinity) { _ in
                player.play()
            }
        } else {
            player.play()
        }

        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 5, preferredTimescale: 1), queue: .main) { [weak self] time in
            guard let self = self else { return }
            // Once the item knows its duration, persist it so sidebar thumbnails
            // can compute % watched. (Older library entries lack this field.)
            if let videoId = self.currentContext?.video.videoId,
               let dur = self.playerView.player?.currentItem?.duration.seconds, dur.isFinite, dur > 0 {
                Library.shared.setDurationIfMissing(videoId: videoId, duration: dur)
            }
            let s = time.seconds
            guard s.isFinite, s >= 1 else { return }
            self.persistResume(seconds: s)
        }

        if !cues.isEmpty {
            subtitleObserver = player.addPeriodicTimeObserver(
                forInterval: CMTime(value: 1, timescale: 10), queue: .main
            ) { [weak self] time in
                self?.updateSubtitle(at: time.seconds)
            }
        }

        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in
            self?.persistResume(seconds: 0)
            self?.advanceIfPlaylist()
        }
    }

    private func loadSubtitles(forVideoId videoId: String?) {
        cues = []
        subtitleLabel.isHidden = true
        subtitleLabel.setText("")
        guard let videoId,
              let vtt = YTDLP.findSubtitleFile(videoId: videoId, in: VideoCache.dir) else { return }
        let parsed = VTTParser.parse(vtt)
        guard !parsed.isEmpty else { return }
        cues = parsed
        subtitleLabel.isHidden = false
    }

    private func updateSubtitle(at time: Double) {
        guard subtitlesEnabled, !cues.isEmpty, time.isFinite else { return }
        let text = activeCueText(at: time)
        subtitleLabel.setText(text)
    }

    private func activeCueText(at time: Double) -> String {
        // Cues are time-ordered; binary search the last cue with start <= time.
        var lo = 0, hi = cues.count - 1, found = -1
        while lo <= hi {
            let mid = (lo + hi) / 2
            if cues[mid].start <= time { found = mid; lo = mid + 1 } else { hi = mid - 1 }
        }
        guard found >= 0 else { return "" }
        let cue = cues[found]
        return time <= cue.end ? cue.text : ""
    }

    private func persistResume(seconds: Double) {
        guard let ctx = currentContext, seconds.isFinite else { return }
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

    private func teardownPlayer() {
        if let player = playerView.player {
            if let obs = timeObserver { player.removeTimeObserver(obs) }
            if let obs = subtitleObserver { player.removeTimeObserver(obs) }
        }
        timeObserver = nil
        subtitleObserver = nil
        if let obs = endObserver { NotificationCenter.default.removeObserver(obs) }
        endObserver = nil
        playerView.player?.pause()
        playerView.player = nil
        cues = []
        subtitleLabel.isHidden = true
        subtitleLabel.setText("")
    }

    deinit {
        teardownPlayer()
        currentDownload?.terminate()
        if let m = keyMonitor { NSEvent.removeMonitor(m) }
        videoBoundsObserver?.invalidate()
    }
}

// MARK: - Subtitle label

private final class SubtitleLabel: NSView {
    private let label = NSTextField(labelWithString: "")
    private var heightZeroConstraint: NSLayoutConstraint?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setup()
    }
    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.withAlphaComponent(0.6).cgColor
        layer?.cornerRadius = 4

        label.translatesAutoresizingMaskIntoConstraints = false
        label.alignment = .center
        label.font = NSFont.systemFont(ofSize: 18, weight: .medium)
        label.textColor = .white
        label.maximumNumberOfLines = 0
        label.lineBreakMode = .byWordWrapping
        addSubview(label)
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: topAnchor, constant: 6),
            label.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -6),
            label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
        ])
        setText("")
    }

    func setText(_ s: String) {
        label.stringValue = s
        let empty = s.isEmpty
        layer?.backgroundColor = (empty ? NSColor.clear : NSColor.black.withAlphaComponent(0.6)).cgColor
    }
}

// MARK: - Progress overlay

private final class ProgressOverlay: NSView {
    private let titleLabel = NSTextField(labelWithString: "")
    private let bar = NSProgressIndicator()
    private let statusLabel = NSTextField(labelWithString: "")

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setup()
    }
    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        wantsLayer = true
        layer?.backgroundColor = NSColor.windowBackgroundColor.withAlphaComponent(0.95).cgColor
        layer?.cornerRadius = 8

        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.font = NSFont.systemFont(ofSize: 13, weight: .medium)
        titleLabel.maximumNumberOfLines = 2
        titleLabel.lineBreakMode = .byTruncatingTail

        bar.translatesAutoresizingMaskIntoConstraints = false
        bar.style = .bar
        bar.isIndeterminate = false
        bar.minValue = 0
        bar.maxValue = 1

        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.font = NSFont.systemFont(ofSize: 11)
        statusLabel.textColor = .secondaryLabelColor

        addSubview(titleLabel); addSubview(bar); addSubview(statusLabel)
        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: topAnchor, constant: 12),
            titleLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            titleLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            bar.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            bar.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            bar.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            statusLabel.topAnchor.constraint(equalTo: bar.bottomAnchor, constant: 8),
            statusLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            statusLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            statusLabel.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -12),
        ])
    }

    func set(title: String, percent: Double, status: String) {
        titleLabel.stringValue = title
        bar.doubleValue = max(0, min(1, percent))
        statusLabel.stringValue = status
    }

    func setIndeterminate(_ on: Bool) {
        bar.isIndeterminate = on
        if on { bar.startAnimation(nil) } else { bar.stopAnimation(nil) }
    }
}
