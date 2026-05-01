import AppKit

/// What got selected in the sidebar — passed to the player so it knows where to resume.
struct PlayContext {
    let video: Video
    let playlistId: String?  // nil = standalone
    let indexInPlaylist: Int?
}

final class SidebarViewController: NSViewController {
    var onSelectVideo: ((PlayContext) -> Void)?

    private let popUp = NSPopUpButton(frame: .zero, pullsDown: false)
    private let scroll = NSScrollView()
    private let collection = NSCollectionView()

    /// Source the grid is currently showing.
    /// nil = standalone, else playlist local id.
    private var currentPlaylistId: String?
    private var currentItems: [Video] = []

    override func loadView() {
        let v = NSView(frame: NSRect(x: 0, y: 0, width: 280, height: 700))
        v.autoresizingMask = [.width, .height]

        popUp.translatesAutoresizingMaskIntoConstraints = false
        popUp.target = self
        popUp.action = #selector(sourceChanged)
        v.addSubview(popUp)

        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false

        let layout = NSCollectionViewFlowLayout()
        layout.itemSize = NSSize(width: 240, height: 170)
        layout.sectionInset = NSEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
        layout.minimumLineSpacing = 8
        layout.minimumInteritemSpacing = 8

        collection.collectionViewLayout = layout
        collection.dataSource = self
        collection.delegate = self
        collection.isSelectable = true
        collection.backgroundColors = [.clear]
        collection.register(VideoThumbItem.self, forItemWithIdentifier: VideoThumbItem.identifier)
        scroll.documentView = collection
        v.addSubview(scroll)

        NSLayoutConstraint.activate([
            popUp.topAnchor.constraint(equalTo: v.topAnchor, constant: 10),
            popUp.leadingAnchor.constraint(equalTo: v.leadingAnchor, constant: 10),
            popUp.trailingAnchor.constraint(equalTo: v.trailingAnchor, constant: -10),
            scroll.topAnchor.constraint(equalTo: popUp.bottomAnchor, constant: 8),
            scroll.leadingAnchor.constraint(equalTo: v.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: v.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: v.bottomAnchor),
        ])
        self.view = v
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        rebuildPopUp()
        NotificationCenter.default.addObserver(self, selector: #selector(libraryChanged), name: Library.didChange, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(cacheChanged), name: .videoCacheDidChange, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(selectPlaylist(_:)), name: .selectPlaylist, object: nil)
    }

    @objc private func selectPlaylist(_ note: Notification) {
        guard let plId = note.userInfo?["playlistId"] as? String,
              let pl = Library.shared.data.playlists.first(where: { $0.id == plId }) else { return }
        let title = pl.title.isEmpty ? "Playlist" : pl.title
        if popUp.itemTitles.contains(title) {
            popUp.selectItem(withTitle: title)
            sourceChanged()
        }
    }

    @objc private func libraryChanged() {
        rebuildPopUp()
        loadCurrentSource()
    }

    @objc private func cacheChanged() {
        collection.reloadData()
    }

    private func rebuildPopUp() {
        let prevTitle = popUp.titleOfSelectedItem
        popUp.removeAllItems()
        for p in Library.shared.data.playlists {
            popUp.addItem(withTitle: p.title.isEmpty ? "Playlist" : p.title)
            popUp.lastItem?.representedObject = p.id
        }
        popUp.menu?.addItem(.separator())
        popUp.addItem(withTitle: "Single videos")
        popUp.lastItem?.representedObject = "__standalone__"

        if let prev = prevTitle, popUp.itemTitles.contains(prev) {
            popUp.selectItem(withTitle: prev)
        } else {
            popUp.selectItem(at: 0)
        }
        sourceChanged()
    }

    @objc private func sourceChanged() {
        loadCurrentSource()
    }

    private func loadCurrentSource() {
        let key = popUp.selectedItem?.representedObject as? String
        if key == "__standalone__" || key == nil && popUp.numberOfItems == 1 {
            currentPlaylistId = nil
            currentItems = Library.shared.data.standaloneVideos
        } else if let id = key, let pl = Library.shared.data.playlists.first(where: { $0.id == id }) {
            currentPlaylistId = pl.id
            currentItems = pl.items
        } else {
            currentPlaylistId = nil
            currentItems = []
        }
        collection.reloadData()
    }
}

extension SidebarViewController: NSCollectionViewDataSource, NSCollectionViewDelegate {
    func collectionView(_ collectionView: NSCollectionView, numberOfItemsInSection section: Int) -> Int {
        currentItems.count
    }

    func collectionView(_ collectionView: NSCollectionView, itemForRepresentedObjectAt indexPath: IndexPath) -> NSCollectionViewItem {
        let item = collectionView.makeItem(withIdentifier: VideoThumbItem.identifier, for: indexPath) as! VideoThumbItem
        let v = currentItems[indexPath.item]
        let dim = !PlayerViewController.streamingMode && !VideoCache.isCached(videoId: v.videoId)
        item.configure(with: v, dim: dim)
        return item
    }

    func collectionView(_ collectionView: NSCollectionView, didSelectItemsAt indexPaths: Set<IndexPath>) {
        guard let ip = indexPaths.first else { return }
        let video = currentItems[ip.item]
        let ctx = PlayContext(
            video: video,
            playlistId: currentPlaylistId,
            indexInPlaylist: currentPlaylistId == nil ? nil : ip.item
        )
        if let plId = currentPlaylistId {
            Library.shared.setCurrentIndex(playlistId: plId, index: ip.item)
        }
        onSelectVideo?(ctx)
    }
}

// MARK: - Thumb item

final class VideoThumbItem: NSCollectionViewItem {
    static let identifier = NSUserInterfaceItemIdentifier("VideoThumbItem")
    private let thumb = NSImageView()
    private let titleLabel = NSTextField(labelWithString: "")
    private let progressBar = ThinProgressBar()
    private var videoId: String?
    private var duration: Double?

    override func loadView() {
        let v = HoverView()
        v.wantsLayer = true
        v.layer?.cornerRadius = 6
        v.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
        thumb.translatesAutoresizingMaskIntoConstraints = false
        thumb.imageScaling = .scaleProportionallyUpOrDown
        thumb.wantsLayer = true
        thumb.layer?.cornerRadius = 4
        thumb.layer?.masksToBounds = true
        thumb.image = NSImage(named: NSImage.everyoneName)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.maximumNumberOfLines = 2
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.font = NSFont.systemFont(ofSize: 12)
        progressBar.translatesAutoresizingMaskIntoConstraints = false
        progressBar.isHidden = true

        v.addSubview(thumb)
        v.addSubview(progressBar)
        v.addSubview(titleLabel)
        NSLayoutConstraint.activate([
            thumb.topAnchor.constraint(equalTo: v.topAnchor, constant: 4),
            thumb.leadingAnchor.constraint(equalTo: v.leadingAnchor, constant: 4),
            thumb.trailingAnchor.constraint(equalTo: v.trailingAnchor, constant: -4),
            thumb.heightAnchor.constraint(equalToConstant: 124),
            progressBar.topAnchor.constraint(equalTo: thumb.bottomAnchor, constant: 2),
            progressBar.leadingAnchor.constraint(equalTo: v.leadingAnchor, constant: 4),
            progressBar.trailingAnchor.constraint(equalTo: v.trailingAnchor, constant: -4),
            progressBar.heightAnchor.constraint(equalToConstant: 3),
            titleLabel.topAnchor.constraint(equalTo: progressBar.bottomAnchor, constant: 4),
            titleLabel.leadingAnchor.constraint(equalTo: v.leadingAnchor, constant: 6),
            titleLabel.trailingAnchor.constraint(equalTo: v.trailingAnchor, constant: -6),
            titleLabel.bottomAnchor.constraint(lessThanOrEqualTo: v.bottomAnchor, constant: -4),
        ])
        self.view = v
        NotificationCenter.default.addObserver(self, selector: #selector(resumeChanged(_:)), name: Library.resumeDidChange, object: nil)
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    @objc private func resumeChanged(_ note: Notification) {
        guard let updatedId = note.userInfo?["videoId"] as? String, updatedId == videoId else { return }
        let seconds = (note.userInfo?["seconds"] as? Double) ?? 0
        applyWatched(seconds: seconds)
    }

    private func applyWatched(seconds: Double) {
        guard let dur = duration, dur > 0 else {
            progressBar.isHidden = true
            return
        }
        progressBar.isHidden = false
        progressBar.percent = max(0, min(1, seconds / dur))
    }

    override var isSelected: Bool {
        didSet {
            view.layer?.borderColor = (isSelected ? NSColor.controlAccentColor.cgColor : NSColor.clear.cgColor)
            view.layer?.borderWidth = isSelected ? 2 : 0
        }
    }

    override func mouseEntered(with event: NSEvent) { NSCursor.pointingHand.set() }
    override func mouseExited(with event: NSEvent) { NSCursor.arrow.set() }

    func configure(with video: Video, dim: Bool = false) {
        videoId = video.videoId
        duration = video.duration
        titleLabel.stringValue = video.title
        view.alphaValue = dim ? 0.45 : 1.0
        applyWatched(seconds: video.resumeSeconds)
        thumb.image = nil
        guard let urlStr = video.thumbnailURL, let url = URL(string: urlStr) else { return }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let data = data, let img = NSImage(data: data) else { return }
            DispatchQueue.main.async { self?.thumb.image = img }
        }.resume()
    }
}

/// NSView that forwards mouseEntered/mouseExited to its NSCollectionViewItem (so the item can change cursor).
final class HoverView: NSView {
    private var trackingArea: NSTrackingArea?

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let ta = trackingArea { removeTrackingArea(ta) }
        let ta = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect], owner: self, userInfo: nil)
        addTrackingArea(ta)
        trackingArea = ta
    }
    override func mouseEntered(with event: NSEvent) { NSCursor.pointingHand.set() }
    override func mouseExited(with event: NSEvent) { NSCursor.arrow.set() }
    override func resetCursorRects() {
        super.resetCursorRects()
        addCursorRect(bounds, cursor: .pointingHand)
    }
}

/// Thin layer-drawn progress bar.
final class ThinProgressBar: NSView {
    var percent: Double = 0 { didSet { needsDisplay = true } }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
    }
    required init?(coder: NSCoder) { fatalError() }

    override func draw(_ dirtyRect: NSRect) {
        let track = bounds
        NSColor.separatorColor.withAlphaComponent(0.4).setFill()
        NSBezierPath(roundedRect: track, xRadius: 1.5, yRadius: 1.5).fill()
        let w = max(0, min(1, percent)) * track.width
        if w > 0 {
            let fill = NSRect(x: 0, y: 0, width: w, height: track.height)
            NSColor.controlAccentColor.setFill()
            NSBezierPath(roundedRect: fill, xRadius: 1.5, yRadius: 1.5).fill()
        }
    }
}
