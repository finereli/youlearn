import Foundation

struct Video: Codable {
    var videoId: String
    var title: String
    var thumbnailURL: String?
    var resumeSeconds: Double = 0
    var duration: Double?
}

struct Playlist: Codable {
    var id: String                  // local UUID
    var title: String
    var youtubePlaylistId: String
    var currentIndex: Int = 0
    var items: [Video] = []
}

struct LibraryData: Codable {
    var playlists: [Playlist] = []
    var standaloneVideos: [Video] = []
}

final class Library {
    static let shared = Library()
    private(set) var data = LibraryData()

    static let didChange = Notification.Name("LibraryDidChange")
    static let resumeDidChange = Notification.Name("LibraryResumeDidChange")

    private var fileURL: URL {
        let fm = FileManager.default
        let base = try! fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let dir = base.appendingPathComponent("YouLearn", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("library.json")
    }

    func load() {
        guard let raw = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder().decode(LibraryData.self, from: raw) else { return }
        data = decoded
    }

    private func writeOnly() {
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        if let raw = try? enc.encode(data) {
            try? raw.write(to: fileURL, options: .atomic)
        }
    }

    func save() {
        writeOnly()
        NotificationCenter.default.post(name: Library.didChange, object: nil)
    }

    // MARK: - mutations

    func addPlaylist(_ p: Playlist) { data.playlists.append(p); save() }
    func removePlaylist(id: String) { data.playlists.removeAll { $0.id == id }; save() }
    func updatePlaylist(_ p: Playlist) {
        if let i = data.playlists.firstIndex(where: { $0.id == p.id }) {
            data.playlists[i] = p; save()
        }
    }
    func addStandaloneVideo(_ v: Video) { data.standaloneVideos.append(v); save() }
    func removeStandaloneVideo(id: String) { data.standaloneVideos.removeAll { $0.videoId == id }; save() }

    // Lightweight mutations: persist but don't post structural change (avoids sidebar reload flicker).

    func setResume(playlistId: String, videoId: String, seconds: Double) {
        guard let pi = data.playlists.firstIndex(where: { $0.id == playlistId }),
              let vi = data.playlists[pi].items.firstIndex(where: { $0.videoId == videoId }) else { return }
        data.playlists[pi].items[vi].resumeSeconds = seconds
        writeOnly()
        postResumeChange(videoId: videoId, seconds: seconds)
    }

    func setResume(standaloneVideoId: String, seconds: Double) {
        guard let i = data.standaloneVideos.firstIndex(where: { $0.videoId == standaloneVideoId }) else { return }
        data.standaloneVideos[i].resumeSeconds = seconds
        writeOnly()
        postResumeChange(videoId: standaloneVideoId, seconds: seconds)
    }

    private func postResumeChange(videoId: String, seconds: Double) {
        NotificationCenter.default.post(name: Library.resumeDidChange, object: nil,
                                        userInfo: ["videoId": videoId, "seconds": seconds])
    }

    func duration(forVideoId id: String) -> Double? {
        for p in data.playlists {
            if let v = p.items.first(where: { $0.videoId == id }), let d = v.duration { return d }
        }
        if let v = data.standaloneVideos.first(where: { $0.videoId == id }), let d = v.duration { return d }
        return nil
    }

    func resumeSeconds(forVideoId id: String) -> Double {
        for p in data.playlists {
            if let v = p.items.first(where: { $0.videoId == id }) { return v.resumeSeconds }
        }
        if let v = data.standaloneVideos.first(where: { $0.videoId == id }) { return v.resumeSeconds }
        return 0
    }

    func setCurrentIndex(playlistId: String, index: Int) {
        guard let i = data.playlists.firstIndex(where: { $0.id == playlistId }) else { return }
        data.playlists[i].currentIndex = index
        writeOnly()
    }
}
