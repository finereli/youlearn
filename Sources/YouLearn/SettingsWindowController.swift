import AppKit

final class SettingsWindowController: NSWindowController, NSTableViewDataSource, NSTableViewDelegate, NSTabViewDelegate {
    static let shared = SettingsWindowController()

    private let tabs = NSTabView()
    private let playlistTable = NSTableView()
    private let videoTable = NSTableView()
    private let cacheTable = NSTableView()
    private let cacheTotalLabel = NSTextField(labelWithString: "")
    private let newPasswordField = NSSecureTextField()

    private var cacheEntries: [VideoCache.Entry] = []

    private convenience init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 700, height: 500),
            styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "YouLearn Settings"
        window.center()
        self.init(window: window)
        buildUI()
    }

    private func buildUI() {
        let content = NSView()
        tabs.translatesAutoresizingMaskIntoConstraints = false
        tabs.delegate = self
        tabs.addTabViewItem(makePlaylistTab())
        tabs.addTabViewItem(makeVideosTab())
        tabs.addTabViewItem(makeCacheTab())
        tabs.addTabViewItem(makeGeneralTab())
        content.addSubview(tabs)
        NSLayoutConstraint.activate([
            tabs.topAnchor.constraint(equalTo: content.topAnchor, constant: 8),
            tabs.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 8),
            tabs.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -8),
            tabs.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -8),
        ])
        window?.contentView = content
    }

    override func showWindow(_ sender: Any?) {
        super.showWindow(sender)
        window?.setContentSize(NSSize(width: 700, height: 500))
        reloadCache()
    }

    // MARK: - Playlists tab

    private func makePlaylistTab() -> NSTabViewItem {
        let item = NSTabViewItem(identifier: "playlists"); item.label = "Playlists"
        let v = NSView()
        let scroll = NSScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.hasVerticalScroller = true
        playlistTable.addTableColumn(NSTableColumn(identifier: NSUserInterfaceItemIdentifier("title")))
        playlistTable.tableColumns[0].title = "Title"; playlistTable.tableColumns[0].width = 460
        playlistTable.addTableColumn(NSTableColumn(identifier: NSUserInterfaceItemIdentifier("count")))
        playlistTable.tableColumns[1].title = "Videos"
        playlistTable.dataSource = self; playlistTable.delegate = self
        playlistTable.identifier = NSUserInterfaceItemIdentifier("playlists")
        scroll.documentView = playlistTable

        let addBtn = NSButton(title: "Add…", target: self, action: #selector(addPlaylist))
        let refreshBtn = NSButton(title: "Refresh", target: self, action: #selector(refreshPlaylist))
        let removeBtn = NSButton(title: "Remove", target: self, action: #selector(removePlaylist))
        let stack = NSStackView(views: [addBtn, refreshBtn, removeBtn])
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.orientation = .horizontal
        v.addSubview(scroll); v.addSubview(stack)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: v.topAnchor, constant: 8),
            scroll.leadingAnchor.constraint(equalTo: v.leadingAnchor, constant: 8),
            scroll.trailingAnchor.constraint(equalTo: v.trailingAnchor, constant: -8),
            scroll.bottomAnchor.constraint(equalTo: stack.topAnchor, constant: -8),
            stack.leadingAnchor.constraint(equalTo: v.leadingAnchor, constant: 8),
            stack.bottomAnchor.constraint(equalTo: v.bottomAnchor, constant: -8),
        ])
        item.view = v; return item
    }

    // MARK: - Videos tab

    private func makeVideosTab() -> NSTabViewItem {
        let item = NSTabViewItem(identifier: "videos"); item.label = "Single Videos"
        let v = NSView()
        let scroll = NSScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.hasVerticalScroller = true
        videoTable.addTableColumn(NSTableColumn(identifier: NSUserInterfaceItemIdentifier("title")))
        videoTable.tableColumns[0].title = "Title"; videoTable.tableColumns[0].width = 560
        videoTable.dataSource = self; videoTable.delegate = self
        videoTable.identifier = NSUserInterfaceItemIdentifier("videos")
        scroll.documentView = videoTable

        let addBtn = NSButton(title: "Add…", target: self, action: #selector(addVideo))
        let removeBtn = NSButton(title: "Remove", target: self, action: #selector(removeVideo))
        let stack = NSStackView(views: [addBtn, removeBtn])
        stack.translatesAutoresizingMaskIntoConstraints = false; stack.orientation = .horizontal
        v.addSubview(scroll); v.addSubview(stack)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: v.topAnchor, constant: 8),
            scroll.leadingAnchor.constraint(equalTo: v.leadingAnchor, constant: 8),
            scroll.trailingAnchor.constraint(equalTo: v.trailingAnchor, constant: -8),
            scroll.bottomAnchor.constraint(equalTo: stack.topAnchor, constant: -8),
            stack.leadingAnchor.constraint(equalTo: v.leadingAnchor, constant: 8),
            stack.bottomAnchor.constraint(equalTo: v.bottomAnchor, constant: -8),
        ])
        item.view = v; return item
    }

    // MARK: - Cache tab

    private func makeCacheTab() -> NSTabViewItem {
        let item = NSTabViewItem(identifier: "cache"); item.label = "Cache"
        let v = NSView()

        cacheTotalLabel.translatesAutoresizingMaskIntoConstraints = false
        cacheTotalLabel.font = NSFont.systemFont(ofSize: 12, weight: .medium)

        let scroll = NSScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.hasVerticalScroller = true

        let titleCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("title"))
        titleCol.title = "Title"; titleCol.width = 380
        let sizeCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("size"))
        sizeCol.title = "Size"; sizeCol.width = 100
        let dateCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("date"))
        dateCol.title = "Modified"; dateCol.width = 160
        cacheTable.addTableColumn(titleCol); cacheTable.addTableColumn(sizeCol); cacheTable.addTableColumn(dateCol)
        cacheTable.dataSource = self; cacheTable.delegate = self
        cacheTable.identifier = NSUserInterfaceItemIdentifier("cache")
        cacheTable.allowsMultipleSelection = true
        scroll.documentView = cacheTable

        let delSel = NSButton(title: "Delete Selected", target: self, action: #selector(deleteSelectedCache))
        let delAll = NSButton(title: "Delete All", target: self, action: #selector(deleteAllCache))
        let refresh = NSButton(title: "Refresh", target: self, action: #selector(reloadCacheAction))
        let stack = NSStackView(views: [delSel, delAll, refresh])
        stack.translatesAutoresizingMaskIntoConstraints = false; stack.orientation = .horizontal

        v.addSubview(cacheTotalLabel); v.addSubview(scroll); v.addSubview(stack)
        NSLayoutConstraint.activate([
            cacheTotalLabel.topAnchor.constraint(equalTo: v.topAnchor, constant: 12),
            cacheTotalLabel.leadingAnchor.constraint(equalTo: v.leadingAnchor, constant: 12),
            scroll.topAnchor.constraint(equalTo: cacheTotalLabel.bottomAnchor, constant: 8),
            scroll.leadingAnchor.constraint(equalTo: v.leadingAnchor, constant: 8),
            scroll.trailingAnchor.constraint(equalTo: v.trailingAnchor, constant: -8),
            scroll.bottomAnchor.constraint(equalTo: stack.topAnchor, constant: -8),
            stack.leadingAnchor.constraint(equalTo: v.leadingAnchor, constant: 8),
            stack.bottomAnchor.constraint(equalTo: v.bottomAnchor, constant: -8),
        ])
        item.view = v; return item
    }

    // MARK: - General tab

    private func makeGeneralTab() -> NSTabViewItem {
        let item = NSTabViewItem(identifier: "general"); item.label = "General"
        let v = NSView()

        let streamCheck = NSButton(checkboxWithTitle: "Stream videos instead of downloading", target: self, action: #selector(toggleStreaming(_:)))
        streamCheck.state = PlayerViewController.streamingMode ? .on : .off

        let pwLabel = NSTextField(labelWithString: "Change password:")
        newPasswordField.translatesAutoresizingMaskIntoConstraints = false
        newPasswordField.placeholderString = "new password"
        let pwSave = NSButton(title: "Set Password", target: self, action: #selector(savePassword))

        let divider = NSBox(); divider.boxType = .separator
        divider.translatesAutoresizingMaskIntoConstraints = false

        let stack = NSStackView(views: [streamCheck, divider, pwLabel, newPasswordField, pwSave])
        stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false
        v.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: v.topAnchor, constant: 16),
            stack.leadingAnchor.constraint(equalTo: v.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: v.trailingAnchor, constant: -16),
            divider.heightAnchor.constraint(equalToConstant: 1),
            divider.widthAnchor.constraint(equalTo: stack.widthAnchor),
            newPasswordField.widthAnchor.constraint(equalToConstant: 240),
        ])
        item.view = v; return item
    }

    func tabView(_ tabView: NSTabView, didSelect tabViewItem: NSTabViewItem?) {
        window?.setContentSize(NSSize(width: 700, height: 500))
    }

    @objc private func toggleStreaming(_ sender: NSButton) {
        PlayerViewController.streamingMode = (sender.state == .on)
        VideoCache.notifyChanged() // refresh sidebar dimming
    }

    // MARK: - Actions

    @objc private func addPlaylist() {
        guard let url = promptForString(title: "Add playlist", message: "Paste a YouTube playlist URL") else { return }
        YTDLP.fetchPlaylistMetadata(url: url) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let meta):
                    let yid = (URLComponents(string: url)?.queryItems?.first { $0.name == "list" }?.value) ?? url
                    let pl = Playlist(id: UUID().uuidString, title: meta.title, youtubePlaylistId: yid, currentIndex: 0, items: meta.videos)
                    Library.shared.addPlaylist(pl)
                    self?.playlistTable.reloadData()
                    NotificationCenter.default.post(name: .selectPlaylist, object: nil, userInfo: ["playlistId": pl.id])
                case .failure(let e):
                    self?.showError("Failed: \(e)")
                }
            }
        }
    }

    @objc private func refreshPlaylist() {
        let row = playlistTable.selectedRow
        guard row >= 0, row < Library.shared.data.playlists.count else { return }
        let pl = Library.shared.data.playlists[row]
        let url = pl.youtubePlaylistId.contains("://") ? pl.youtubePlaylistId : "https://www.youtube.com/playlist?list=\(pl.youtubePlaylistId)"
        YTDLP.fetchPlaylistMetadata(url: url) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let meta):
                    var updated = pl
                    let oldResume = Dictionary(uniqueKeysWithValues: pl.items.map { ($0.videoId, $0.resumeSeconds) })
                    updated.title = meta.title
                    updated.items = meta.videos.map {
                        var v = $0
                        v.resumeSeconds = oldResume[$0.videoId] ?? 0
                        return v
                    }
                    Library.shared.updatePlaylist(updated)
                    self?.playlistTable.reloadData()
                case .failure(let e):
                    self?.showError("Failed: \(e)")
                }
            }
        }
    }

    @objc private func removePlaylist() {
        let row = playlistTable.selectedRow
        guard row >= 0, row < Library.shared.data.playlists.count else { return }
        Library.shared.removePlaylist(id: Library.shared.data.playlists[row].id)
        playlistTable.reloadData()
    }

    @objc private func addVideo() {
        guard let input = promptForString(title: "Add video", message: "Paste a YouTube video URL") else { return }
        YTDLP.fetchVideoMetadata(url: input) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let v):
                    Library.shared.addStandaloneVideo(v)
                    self?.videoTable.reloadData()
                case .failure(let e):
                    self?.showError("Failed: \(e)")
                }
            }
        }
    }

    @objc private func removeVideo() {
        let row = videoTable.selectedRow
        guard row >= 0, row < Library.shared.data.standaloneVideos.count else { return }
        Library.shared.removeStandaloneVideo(id: Library.shared.data.standaloneVideos[row].videoId)
        videoTable.reloadData()
    }

    @objc private func savePassword() {
        let pw = newPasswordField.stringValue
        guard !pw.isEmpty else { return }
        PasswordGate.setPassword(pw)
        newPasswordField.stringValue = ""
        let a = NSAlert(); a.messageText = "Password updated."; a.runModal()
    }

    @objc private func reloadCacheAction() { reloadCache() }

    @objc private func deleteSelectedCache() {
        let rows = cacheTable.selectedRowIndexes
        let toDelete = rows.compactMap { $0 < cacheEntries.count ? cacheEntries[$0] : nil }
        guard !toDelete.isEmpty else { return }
        VideoCache.delete(toDelete)
        reloadCache()
    }

    @objc private func deleteAllCache() {
        let alert = NSAlert()
        alert.messageText = "Delete all cached videos?"
        alert.informativeText = "This frees \(VideoCache.formatBytes(VideoCache.totalBytes())) of disk."
        alert.addButton(withTitle: "Delete")
        alert.addButton(withTitle: "Cancel")
        if alert.runModal() == .alertFirstButtonReturn {
            VideoCache.deleteAll()
            reloadCache()
        }
    }

    private func reloadCache() {
        cacheEntries = VideoCache.list()
        cacheTotalLabel.stringValue = "\(cacheEntries.count) videos · \(VideoCache.formatBytes(VideoCache.totalBytes())) total"
        cacheTable.reloadData()
    }

    // MARK: - Helpers

    private func promptForString(title: String, message: String) -> String? {
        let alert = NSAlert()
        alert.messageText = title; alert.informativeText = message
        alert.addButton(withTitle: "OK"); alert.addButton(withTitle: "Cancel")
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 400, height: 24))
        field.cell?.usesSingleLineMode = true
        field.cell?.wraps = false
        field.cell?.isScrollable = true
        field.lineBreakMode = .byClipping
        alert.accessoryView = field
        alert.window.initialFirstResponder = field
        let r = alert.runModal()
        return r == .alertFirstButtonReturn ? field.stringValue : nil
    }

    private func showError(_ msg: String) {
        let a = NSAlert(); a.messageText = "Error"; a.informativeText = msg; a.runModal()
    }

    // MARK: - Table data

    func numberOfRows(in tableView: NSTableView) -> Int {
        switch tableView.identifier?.rawValue {
        case "playlists": return Library.shared.data.playlists.count
        case "videos": return Library.shared.data.standaloneVideos.count
        case "cache": return cacheEntries.count
        default: return 0
        }
    }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let cell = NSTextField(labelWithString: "")
        cell.identifier = tableColumn?.identifier
        cell.lineBreakMode = .byTruncatingTail
        let colId = tableColumn?.identifier.rawValue ?? ""
        switch tableView.identifier?.rawValue {
        case "playlists":
            let pl = Library.shared.data.playlists[row]
            cell.stringValue = colId == "count" ? "\(pl.items.count)" : pl.title
        case "videos":
            cell.stringValue = Library.shared.data.standaloneVideos[row].title
        case "cache":
            let e = cacheEntries[row]
            switch colId {
            case "size": cell.stringValue = VideoCache.formatBytes(e.bytes)
            case "date":
                let f = DateFormatter(); f.dateStyle = .short; f.timeStyle = .short
                cell.stringValue = f.string(from: e.modified)
            default: cell.stringValue = e.title
            }
        default: break
        }
        return cell
    }
}
