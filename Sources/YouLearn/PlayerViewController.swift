import AppKit
import AVKit
import AVFoundation

final class PlayerViewController: NSViewController {
    private let playerView = AVPlayerView()
    private let progressOverlay = ProgressOverlay()
    private let placeholder = NSTextField(labelWithString: "Pick a video from the sidebar.")

    private var currentContext: PlayContext?
    private var currentDownload: Process?
    private var activeToken: UUID?
    private var timeObserver: Any?
    private var endObserver: Any?

    static var streamingMode: Bool {
        get { UserDefaults.standard.bool(forKey: "YouLearn.streamingMode") }
        set { UserDefaults.standard.set(newValue, forKey: "YouLearn.streamingMode") }
    }

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

        v.addSubview(playerView)
        v.addSubview(progressOverlay)
        v.addSubview(placeholder)

        NSLayoutConstraint.activate([
            playerView.topAnchor.constraint(equalTo: v.topAnchor),
            playerView.leadingAnchor.constraint(equalTo: v.leadingAnchor),
            playerView.trailingAnchor.constraint(equalTo: v.trailingAnchor),
            playerView.bottomAnchor.constraint(equalTo: v.bottomAnchor),
            progressOverlay.centerXAnchor.constraint(equalTo: v.centerXAnchor),
            progressOverlay.centerYAnchor.constraint(equalTo: v.centerYAnchor),
            progressOverlay.widthAnchor.constraint(equalToConstant: 360),
            placeholder.centerXAnchor.constraint(equalTo: v.centerXAnchor),
            placeholder.centerYAnchor.constraint(equalTo: v.centerYAnchor),
        ])
        self.view = v
    }

    func play(context: PlayContext) {
        teardownPlayer()
        currentDownload?.terminate()
        currentDownload = nil
        // Clean up any stale .part file from the prior download so it doesn't masquerade as a cached video later.
        if let prior = currentContext?.video.videoId {
            YTDLP.deletePartialFiles(videoId: prior, in: VideoCache.dir)
        }

        currentContext = context
        placeholder.isHidden = true

        let token = UUID()
        activeToken = token

        if let cached = VideoCache.cachedFile(videoId: context.video.videoId) {
            startPlayback(url: cached)
        } else if Self.streamingMode {
            startStreaming(for: context, token: token)
        } else {
            startDownload(for: context, token: token)
        }
    }

    private func startStreaming(for context: PlayContext, token: UUID) {
        playerView.isHidden = true
        progressOverlay.isHidden = false
        progressOverlay.set(title: context.video.title, percent: 0, status: "Resolving stream…")
        progressOverlay.setIndeterminate(true)

        YTDLP.fetchStreamURL(videoId: context.video.videoId) { [weak self] result in
            guard let self = self, self.activeToken == token else { return }
            self.progressOverlay.setIndeterminate(false)
            switch result {
            case .success(let url): self.startPlayback(url: url)
            case .failure(let err):
                self.progressOverlay.set(title: context.video.title, percent: 0, status: "Failed: \(err)")
            }
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
                    self.progressOverlay.set(title: context.video.title, percent: 0, status: "Failed: \(err)")
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
            let s = time.seconds
            // The observer fires once on registration with the current time, before any
            // pending seek completes — guarding on s >= 1 avoids overwriting the saved
            // resume with 0 at the start of playback.
            guard s.isFinite, s >= 1 else { return }
            self?.persistResume(seconds: s)
        }

        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in
            self?.persistResume(seconds: 0)
            self?.advanceIfPlaylist()
        }
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
        }
        timeObserver = nil
        if let obs = endObserver { NotificationCenter.default.removeObserver(obs) }
        endObserver = nil
        playerView.player?.pause()
        playerView.player = nil
    }

    deinit {
        teardownPlayer()
        currentDownload?.terminate()
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
