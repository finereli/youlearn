import Foundation

enum VideoCache {
    static var dir: URL {
        let fm = FileManager.default
        let base = try! fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let d = base.appendingPathComponent("YouLearn/cache", isDirectory: true)
        try? fm.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    static func cachedFile(videoId: String) -> URL? {
        YTDLP.findCachedFile(videoId: videoId, in: dir)
    }

    struct Entry {
        let url: URL
        let videoId: String
        let title: String   // resolved from Library when possible
        let bytes: Int64
        let modified: Date
    }

    static func list() -> [Entry] {
        let fm = FileManager.default
        guard let items = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey]) else { return [] }
        let titles = libraryTitlesById()
        return items.compactMap { url in
            let name = url.lastPathComponent
            if name.hasSuffix(".part") || name.contains(".part") || name.hasSuffix(".ytdl") { return nil }
            let id = url.deletingPathExtension().lastPathComponent
            let attrs = try? url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
            let bytes = Int64(attrs?.fileSize ?? 0)
            let mod = attrs?.contentModificationDate ?? Date.distantPast
            return Entry(url: url, videoId: id, title: titles[id] ?? id, bytes: bytes, modified: mod)
        }.sorted { $0.modified > $1.modified }
    }

    static func isCached(videoId: String) -> Bool {
        cachedFile(videoId: videoId) != nil
    }

    static func totalBytes() -> Int64 {
        list().reduce(0) { $0 + $1.bytes }
    }

    static func delete(_ entries: [Entry]) {
        for e in entries { try? FileManager.default.removeItem(at: e.url) }
        NotificationCenter.default.post(name: .videoCacheDidChange, object: nil)
    }

    static func deleteAll() {
        delete(list())
    }

    static func notifyChanged() {
        NotificationCenter.default.post(name: .videoCacheDidChange, object: nil)
    }

    private static func libraryTitlesById() -> [String: String] {
        var map: [String: String] = [:]
        for v in Library.shared.data.standaloneVideos { map[v.videoId] = v.title }
        for p in Library.shared.data.playlists {
            for v in p.items { map[v.videoId] = v.title }
        }
        return map
    }

    static func formatBytes(_ b: Int64) -> String {
        let f = ByteCountFormatter()
        f.allowedUnits = [.useMB, .useGB, .useKB]
        f.countStyle = .file
        return f.string(fromByteCount: b)
    }
}
