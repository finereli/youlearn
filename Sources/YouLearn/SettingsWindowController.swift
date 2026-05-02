import AppKit

final class SettingsWindowController: NSWindowController, NSTableViewDataSource, NSTableViewDelegate, NSTabViewDelegate {
    static let shared = SettingsWindowController()

    private let tabs = NSTabView()
    private let playlistTable = NSTableView()
    private let videoTable = NSTableView()
    private let newPasswordField = NSSecureTextField()

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

    // MARK: - General tab

    private func makeGeneralTab() -> NSTabViewItem {
        let item = NSTabViewItem(identifier: "general"); item.label = "General"
        let v = NSView()

        let pwLabel = NSTextField(labelWithString: "Change password:")
        newPasswordField.translatesAutoresizingMaskIntoConstraints = false
        newPasswordField.placeholderString = "new password"
        let pwSave = NSButton(title: "Set Password", target: self, action: #selector(savePassword))

        let stack = NSStackView(views: [pwLabel, newPasswordField, pwSave])
        stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false
        v.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: v.topAnchor, constant: 16),
            stack.leadingAnchor.constraint(equalTo: v.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: v.trailingAnchor, constant: -16),
            newPasswordField.widthAnchor.constraint(equalToConstant: 240),
        ])
        item.view = v; return item
    }

    func tabView(_ tabView: NSTabView, didSelect tabViewItem: NSTabViewItem?) {
        window?.setContentSize(NSSize(width: 700, height: 500))
    }

    // MARK: - Actions

    @objc private func addPlaylist() {
        guard let input = promptForString(title: "Add playlist", message: "Paste a YouTube playlist URL") else { return }
        guard let plId = YouTubeAPI.extractPlaylistId(from: input) else {
            showError(YouTubeAPI.Error.notFound("playlist id in \(input)"), title: "Invalid URL")
            return
        }
        YouTubeAPI.fetchPlaylist(id: plId) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let (title, videos)):
                    let pl = Playlist(id: UUID().uuidString, title: title, youtubePlaylistId: plId, currentIndex: 0, items: videos)
                    Library.shared.addPlaylist(pl)
                    self?.playlistTable.reloadData()
                    NotificationCenter.default.post(name: Library.selectPlaylist, object: nil, userInfo: ["playlistId": pl.id])
                case .failure(let e):
                    self?.showError(e, title: "Could not load playlist")
                }
            }
        }
    }

    @objc private func refreshPlaylist() {
        let row = playlistTable.selectedRow
        guard row >= 0, row < Library.shared.data.playlists.count else { return }
        let pl = Library.shared.data.playlists[row]
        YouTubeAPI.fetchPlaylist(id: pl.youtubePlaylistId) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let (title, videos)):
                    var updated = pl
                    let oldResume = Dictionary(uniqueKeysWithValues: pl.items.map { ($0.videoId, $0.resumeSeconds) })
                    updated.title = title
                    updated.items = videos.map {
                        var v = $0
                        v.resumeSeconds = oldResume[$0.videoId] ?? 0
                        return v
                    }
                    Library.shared.updatePlaylist(updated)
                    self?.playlistTable.reloadData()
                case .failure(let e):
                    self?.showError(e, title: "Could not refresh playlist")
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
        guard let vid = YouTubeAPI.extractVideoId(from: input) else {
            showError(YouTubeAPI.Error.notFound("video id in \(input)"), title: "Invalid URL")
            return
        }
        YouTubeAPI.fetchVideo(id: vid) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let v):
                    Library.shared.addStandaloneVideo(v)
                    self?.videoTable.reloadData()
                case .failure(let e):
                    self?.showError(e, title: "Could not load video")
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

    private func showError(_ error: Error, title: String = "Error") {
        ErrorReporter.show(title: title, error: error)
    }

    // MARK: - Table data

    func numberOfRows(in tableView: NSTableView) -> Int {
        switch tableView.identifier?.rawValue {
        case "playlists": return Library.shared.data.playlists.count
        case "videos": return Library.shared.data.standaloneVideos.count
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
        default: break
        }
        return cell
    }
}
