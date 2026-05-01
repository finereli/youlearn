import Foundation

/// Wrapper around the official YouTube Data API v3. Used for metadata only —
/// stream URLs and the actual video bytes still come from elsewhere.
enum YouTubeAPI {
    enum Error: Swift.Error, CustomStringConvertible {
        case missingKey
        case http(Int, String)
        case decode
        case notFound(String)

        var description: String {
            switch self {
            case .missingKey:
                return "YouTube API key not found. Put YOUTUBE_API_KEY=… in .env and rebuild, or set it as an environment variable."
            case .http(let code, let body): return "HTTP \(code): \(body)"
            case .decode: return "Could not decode YouTube API response."
            case .notFound(let what): return "Not found: \(what)"
            }
        }
    }

    // MARK: - Key loading

    /// Loads the API key from (in order): bundled resource (release builds),
    /// `./.env` next to cwd (`swift run` dev), `YOUTUBE_API_KEY` env var.
    static func apiKey() -> String? {
        if let url = Bundle.main.url(forResource: "youtube-api-key", withExtension: "txt"),
           let raw = try? String(contentsOf: url, encoding: .utf8) {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { return trimmed }
        }
        let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent(".env")
        if let raw = try? String(contentsOf: cwd, encoding: .utf8) {
            for line in raw.split(separator: "\n") {
                let s = line.trimmingCharacters(in: .whitespaces)
                if s.hasPrefix("YOUTUBE_API_KEY=") {
                    let v = String(s.dropFirst("YOUTUBE_API_KEY=".count))
                        .trimmingCharacters(in: CharacterSet(charactersIn: "\"' "))
                    if !v.isEmpty { return v }
                }
            }
        }
        if let env = ProcessInfo.processInfo.environment["YOUTUBE_API_KEY"], !env.isEmpty {
            return env
        }
        return nil
    }

    // MARK: - URL helpers

    static func extractVideoId(from input: String) -> String? {
        if input.count == 11, input.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }) {
            return input
        }
        guard let comps = URLComponents(string: input) else { return nil }
        if let v = comps.queryItems?.first(where: { $0.name == "v" })?.value { return v }
        if comps.host?.contains("youtu.be") == true {
            return comps.path.split(separator: "/").first.map(String.init)
        }
        return nil
    }

    static func extractPlaylistId(from input: String) -> String? {
        if input.hasPrefix("PL") || input.hasPrefix("UU") || input.hasPrefix("OL") || input.hasPrefix("FL") || input.hasPrefix("LL") || input.hasPrefix("RD") {
            if !input.contains("/") && !input.contains("?") { return input }
        }
        guard let comps = URLComponents(string: input) else { return nil }
        return comps.queryItems?.first(where: { $0.name == "list" })?.value
    }

    // MARK: - Calls

    /// Fetch one video's metadata. Cost: 1 unit.
    static func fetchVideo(id: String, completion: @escaping (Result<Video, Swift.Error>) -> Void) {
        guard let key = apiKey() else { completion(.failure(Error.missingKey)); return }
        var comps = URLComponents(string: "https://www.googleapis.com/youtube/v3/videos")!
        comps.queryItems = [
            URLQueryItem(name: "part", value: "snippet,contentDetails"),
            URLQueryItem(name: "id", value: id),
            URLQueryItem(name: "key", value: key),
        ]
        request(comps.url!) { result in
            switch result {
            case .failure(let e): completion(.failure(e))
            case .success(let json):
                guard let items = json["items"] as? [[String: Any]], let item = items.first else {
                    completion(.failure(Error.notFound("video \(id)"))); return
                }
                if let v = makeVideo(from: item) { completion(.success(v)) }
                else { completion(.failure(Error.decode)) }
            }
        }
    }

    /// Fetch a playlist's title + all items. Items include durations (one extra
    /// videos.list call per 50 items).
    /// Cost: 1 unit (playlists.list) + N (playlistItems pages) + ceil(items/50) (videos.list).
    static func fetchPlaylist(id: String, completion: @escaping (Result<(title: String, videos: [Video]), Swift.Error>) -> Void) {
        guard let key = apiKey() else { completion(.failure(Error.missingKey)); return }
        fetchPlaylistTitle(id: id, key: key) { titleResult in
            switch titleResult {
            case .failure(let e): completion(.failure(e))
            case .success(let title):
                fetchAllPlaylistItems(playlistId: id, key: key, pageToken: nil, accumulated: []) { itemsResult in
                    switch itemsResult {
                    case .failure(let e): completion(.failure(e))
                    case .success(let partials):
                        // Hydrate durations in batches of 50.
                        hydrateDurations(partials, key: key) { videos in
                            completion(.success((title, videos)))
                        }
                    }
                }
            }
        }
    }

    private static func fetchPlaylistTitle(id: String, key: String, completion: @escaping (Result<String, Swift.Error>) -> Void) {
        var comps = URLComponents(string: "https://www.googleapis.com/youtube/v3/playlists")!
        comps.queryItems = [
            URLQueryItem(name: "part", value: "snippet"),
            URLQueryItem(name: "id", value: id),
            URLQueryItem(name: "key", value: key),
        ]
        request(comps.url!) { result in
            switch result {
            case .failure(let e): completion(.failure(e))
            case .success(let json):
                guard let items = json["items"] as? [[String: Any]],
                      let item = items.first,
                      let snippet = item["snippet"] as? [String: Any],
                      let title = snippet["title"] as? String else {
                    completion(.failure(Error.notFound("playlist \(id)"))); return
                }
                completion(.success(title))
            }
        }
    }

    private static func fetchAllPlaylistItems(playlistId: String, key: String, pageToken: String?, accumulated: [Video], completion: @escaping (Result<[Video], Swift.Error>) -> Void) {
        var comps = URLComponents(string: "https://www.googleapis.com/youtube/v3/playlistItems")!
        var qs: [URLQueryItem] = [
            URLQueryItem(name: "part", value: "snippet,contentDetails"),
            URLQueryItem(name: "playlistId", value: playlistId),
            URLQueryItem(name: "maxResults", value: "50"),
            URLQueryItem(name: "key", value: key),
        ]
        if let pageToken { qs.append(URLQueryItem(name: "pageToken", value: pageToken)) }
        comps.queryItems = qs
        request(comps.url!) { result in
            switch result {
            case .failure(let e): completion(.failure(e))
            case .success(let json):
                let items = (json["items"] as? [[String: Any]]) ?? []
                var videos = accumulated
                for item in items {
                    if let v = makePlaylistItemVideo(from: item) { videos.append(v) }
                }
                if let next = json["nextPageToken"] as? String {
                    fetchAllPlaylistItems(playlistId: playlistId, key: key, pageToken: next, accumulated: videos, completion: completion)
                } else {
                    completion(.success(videos))
                }
            }
        }
    }

    private static func hydrateDurations(_ videos: [Video], key: String, completion: @escaping ([Video]) -> Void) {
        guard !videos.isEmpty else { completion([]); return }
        let group = DispatchGroup()
        var durations: [String: Double] = [:]
        let lock = NSLock()
        for batch in videos.chunked(by: 50) {
            group.enter()
            let ids = batch.map(\.videoId).joined(separator: ",")
            var comps = URLComponents(string: "https://www.googleapis.com/youtube/v3/videos")!
            comps.queryItems = [
                URLQueryItem(name: "part", value: "contentDetails"),
                URLQueryItem(name: "id", value: ids),
                URLQueryItem(name: "key", value: key),
            ]
            request(comps.url!) { result in
                if case .success(let json) = result, let items = json["items"] as? [[String: Any]] {
                    lock.lock()
                    for item in items {
                        if let id = item["id"] as? String,
                           let cd = item["contentDetails"] as? [String: Any],
                           let dur = cd["duration"] as? String {
                            durations[id] = parseISO8601Duration(dur)
                        }
                    }
                    lock.unlock()
                }
                group.leave()
            }
        }
        group.notify(queue: .global(qos: .userInitiated)) {
            let hydrated = videos.map { v -> Video in
                var copy = v
                copy.duration = durations[v.videoId] ?? v.duration
                return copy
            }
            completion(hydrated)
        }
    }

    // MARK: - Decoding helpers

    private static func makeVideo(from item: [String: Any]) -> Video? {
        guard let id = item["id"] as? String,
              let snippet = item["snippet"] as? [String: Any],
              let title = snippet["title"] as? String else { return nil }
        let thumb = bestThumbnail(snippet: snippet) ?? "https://i.ytimg.com/vi/\(id)/mqdefault.jpg"
        var duration: Double? = nil
        if let cd = item["contentDetails"] as? [String: Any], let s = cd["duration"] as? String {
            duration = parseISO8601Duration(s)
        }
        return Video(videoId: id, title: title, thumbnailURL: thumb, resumeSeconds: 0, duration: duration)
    }

    private static func makePlaylistItemVideo(from item: [String: Any]) -> Video? {
        guard let snippet = item["snippet"] as? [String: Any],
              let title = snippet["title"] as? String else { return nil }
        // The item's resourceId.videoId is the actual video. The item id itself is a playlistItem id.
        let videoId: String? = {
            if let rid = snippet["resourceId"] as? [String: Any], let v = rid["videoId"] as? String { return v }
            if let cd = item["contentDetails"] as? [String: Any], let v = cd["videoId"] as? String { return v }
            return nil
        }()
        guard let id = videoId else { return nil }
        if title == "Private video" || title == "Deleted video" { return nil }
        let thumb = bestThumbnail(snippet: snippet) ?? "https://i.ytimg.com/vi/\(id)/mqdefault.jpg"
        return Video(videoId: id, title: title, thumbnailURL: thumb, resumeSeconds: 0, duration: nil)
    }

    private static func bestThumbnail(snippet: [String: Any]) -> String? {
        guard let thumbs = snippet["thumbnails"] as? [String: Any] else { return nil }
        // Prefer "medium" (320×180), fall back to whatever is present.
        for key in ["medium", "high", "standard", "default", "maxres"] {
            if let t = thumbs[key] as? [String: Any], let url = t["url"] as? String { return url }
        }
        return nil
    }

    /// Parse ISO 8601 duration (e.g. "PT1H4M13S") to seconds.
    static func parseISO8601Duration(_ s: String) -> Double {
        guard s.hasPrefix("PT") else { return 0 }
        var hours = 0.0, minutes = 0.0, seconds = 0.0
        var num = ""
        for ch in s.dropFirst(2) {
            if ch.isNumber || ch == "." { num.append(ch) }
            else {
                let v = Double(num) ?? 0
                num = ""
                switch ch {
                case "H": hours = v
                case "M": minutes = v
                case "S": seconds = v
                default: break
                }
            }
        }
        return hours * 3600 + minutes * 60 + seconds
    }

    // MARK: - Networking

    private static func request(_ url: URL, completion: @escaping (Result<[String: Any], Swift.Error>) -> Void) {
        let task = URLSession.shared.dataTask(with: url) { data, resp, err in
            if let err { completion(.failure(err)); return }
            guard let http = resp as? HTTPURLResponse, let data else {
                completion(.failure(Error.decode)); return
            }
            if http.statusCode != 200 {
                let body = String(data: data, encoding: .utf8) ?? ""
                completion(.failure(Error.http(http.statusCode, body)))
                return
            }
            do {
                guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    completion(.failure(Error.decode)); return
                }
                completion(.success(json))
            } catch { completion(.failure(error)) }
        }
        task.resume()
    }
}

private extension Array {
    func chunked(by size: Int) -> [[Element]] {
        guard size > 0 else { return [self] }
        var chunks: [[Element]] = []
        var i = 0
        while i < count {
            chunks.append(Array(self[i..<Swift.min(i + size, count)]))
            i += size
        }
        return chunks
    }
}
