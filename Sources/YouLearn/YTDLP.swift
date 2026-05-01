import Foundation

enum YTDLP {
    enum Error: Swift.Error { case binaryMissing, nonZeroExit(Int32, String), badJSON, missingFile }

    /// Locate the yt-dlp binary. Prefers the bundled copy; falls back to ./vendor/yt-dlp for `swift run` development.
    static func binaryURL() -> URL? {
        if let bundled = Bundle.main.url(forResource: "yt-dlp", withExtension: nil) {
            return bundled
        }
        let exec = Bundle.main.executableURL ?? URL(fileURLWithPath: CommandLine.arguments[0])
        let vendor = exec.deletingLastPathComponent().appendingPathComponent("vendor/yt-dlp")
        if FileManager.default.isExecutableFile(atPath: vendor.path) { return vendor }
        let cwdVendor = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("vendor/yt-dlp")
        if FileManager.default.isExecutableFile(atPath: cwdVendor.path) { return cwdVendor }
        return nil
    }

    // MARK: - Metadata

    struct PlaylistMeta {
        let title: String
        let videos: [Video]
    }

    static func fetchPlaylistMetadata(url: String, completion: @escaping (Result<PlaylistMeta, Swift.Error>) -> Void) {
        runCapturing(args: ["--flat-playlist", "--dump-single-json", "--no-warnings", url]) { result in
            switch result {
            case .failure(let e): completion(.failure(e))
            case .success(let data):
                do {
                    guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw Error.badJSON }
                    let title = (json["title"] as? String) ?? "Playlist"
                    let entries = (json["entries"] as? [[String: Any]]) ?? []
                    let videos: [Video] = entries.compactMap { e in
                        guard let id = e["id"] as? String, let t = e["title"] as? String else { return nil }
                        let thumb = bestThumbnail(from: e) ?? "https://i.ytimg.com/vi/\(id)/mqdefault.jpg"
                        let dur = (e["duration"] as? Double) ?? (e["duration"] as? NSNumber)?.doubleValue
                        return Video(videoId: id, title: t, thumbnailURL: thumb, resumeSeconds: 0, duration: dur)
                    }
                    completion(.success(PlaylistMeta(title: title, videos: videos)))
                } catch { completion(.failure(error)) }
            }
        }
    }

    static func fetchVideoMetadata(url: String, completion: @escaping (Result<Video, Swift.Error>) -> Void) {
        runCapturing(args: ["--dump-single-json", "--no-playlist", "--no-warnings", url]) { result in
            switch result {
            case .failure(let e): completion(.failure(e))
            case .success(let data):
                do {
                    guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                          let id = json["id"] as? String,
                          let title = json["title"] as? String else { throw Error.badJSON }
                    let thumb = bestThumbnail(from: json) ?? "https://i.ytimg.com/vi/\(id)/mqdefault.jpg"
                    let dur = (json["duration"] as? Double) ?? (json["duration"] as? NSNumber)?.doubleValue
                    completion(.success(Video(videoId: id, title: title, thumbnailURL: thumb, resumeSeconds: 0, duration: dur)))
                } catch { completion(.failure(error)) }
            }
        }
    }

    private static func bestThumbnail(from json: [String: Any]) -> String? {
        if let thumbs = json["thumbnails"] as? [[String: Any]] {
            // Prefer ~320 width
            let sorted = thumbs.compactMap { t -> (String, Int)? in
                guard let url = t["url"] as? String else { return nil }
                let w = (t["width"] as? Int) ?? (t["preference"] as? Int) ?? 0
                return (url, w)
            }
            if let pick = sorted.min(by: { abs($0.1 - 320) < abs($1.1 - 320) }) { return pick.0 }
            if let first = thumbs.first?["url"] as? String { return first }
        }
        return json["thumbnail"] as? String
    }

    // MARK: - URL helpers

    static func videoURL(forId id: String) -> String { "https://www.youtube.com/watch?v=\(id)" }

    // MARK: - Process plumbing

    private static func runCapturing(args: [String], completion: @escaping (Result<Data, Swift.Error>) -> Void) {
        guard let bin = binaryURL() else { completion(.failure(Error.binaryMissing)); return }
        DispatchQueue.global(qos: .userInitiated).async {
            let p = Process()
            p.executableURL = bin
            p.arguments = args
            let out = Pipe(); let err = Pipe()
            p.standardOutput = out; p.standardError = err
            do {
                try p.run()
                let data = out.fileHandleForReading.readDataToEndOfFile()
                let errData = err.fileHandleForReading.readDataToEndOfFile()
                p.waitUntilExit()
                if p.terminationStatus != 0 {
                    let msg = String(data: errData, encoding: .utf8) ?? ""
                    completion(.failure(Error.nonZeroExit(p.terminationStatus, msg)))
                } else {
                    completion(.success(data))
                }
            } catch { completion(.failure(error)) }
        }
    }

    // MARK: - Download

    /// Streams a yt-dlp download. progress: (percent 0..1, downloadedBytes, totalBytes, speedString).
    /// On success the destination file URL is returned.
    static func download(videoId: String,
                         to destinationDir: URL,
                         progress: @escaping (Double, Int64, Int64, String) -> Void,
                         completion: @escaping (Result<URL, Swift.Error>) -> Void) -> Process? {
        guard let bin = binaryURL() else { completion(.failure(Error.binaryMissing)); return nil }

        try? FileManager.default.createDirectory(at: destinationDir, withIntermediateDirectories: true)
        let outputTemplate = destinationDir.appendingPathComponent("%(id)s.%(ext)s").path

        let p = Process()
        p.executableURL = bin
        p.arguments = [
            "-f", "22/18/best[ext=mp4][acodec!=none]/best",
            "--no-playlist",
            "--newline",
            "-o", outputTemplate,
            "--progress-template",
            "download:YLPROG|%(progress._percent_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress._speed_str)s",
            videoURL(forId: videoId)
        ]

        let out = Pipe(); let err = Pipe()
        p.standardOutput = out; p.standardError = err

        let handle = out.fileHandleForReading
        var buffer = Data()
        handle.readabilityHandler = { fh in
            let chunk = fh.availableData
            if chunk.isEmpty { return }
            buffer.append(chunk)
            while let nl = buffer.firstIndex(of: 0x0a) {
                let lineData = buffer.prefix(upTo: nl)
                buffer.removeSubrange(...nl)
                guard let line = String(data: lineData, encoding: .utf8) else { continue }
                if line.hasPrefix("YLPROG|") {
                    let parts = line.split(separator: "|", omittingEmptySubsequences: false).map(String.init)
                    if parts.count >= 6 {
                        let pct = Double(parts[1].replacingOccurrences(of: "%", with: "").trimmingCharacters(in: .whitespaces)).map { $0 / 100.0 } ?? 0
                        let dl = Int64(parts[2].trimmingCharacters(in: .whitespaces)) ?? 0
                        let total = Int64(parts[3].trimmingCharacters(in: .whitespaces)) ?? Int64(parts[4].trimmingCharacters(in: .whitespaces)) ?? 0
                        let speed = parts[5].trimmingCharacters(in: .whitespaces)
                        DispatchQueue.main.async { progress(pct, dl, total, speed) }
                    }
                }
            }
        }

        p.terminationHandler = { proc in
            handle.readabilityHandler = nil
            let errData = err.fileHandleForReading.readDataToEndOfFile()
            DispatchQueue.main.async {
                if proc.terminationStatus != 0 {
                    let msg = String(data: errData, encoding: .utf8) ?? ""
                    completion(.failure(Error.nonZeroExit(proc.terminationStatus, msg)))
                    return
                }
                // Find the produced file
                if let found = findCachedFile(videoId: videoId, in: destinationDir) {
                    completion(.success(found))
                } else {
                    completion(.failure(Error.missingFile))
                }
            }
        }

        do { try p.run() } catch {
            handle.readabilityHandler = nil
            completion(.failure(error)); return nil
        }
        return p
    }

    static func findCachedFile(videoId: String, in dir: URL) -> URL? {
        let fm = FileManager.default
        guard let items = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return nil }
        return items.first {
            let name = $0.lastPathComponent
            return name.hasPrefix(videoId + ".") && !name.hasSuffix(".part") && !name.contains(".part.")
        }
    }

    static func deletePartialFiles(videoId: String, in dir: URL) {
        let fm = FileManager.default
        guard let items = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return }
        for url in items where url.lastPathComponent.hasPrefix(videoId + ".") {
            let name = url.lastPathComponent
            if name.hasSuffix(".part") || name.contains(".part") || name.hasSuffix(".ytdl") {
                try? fm.removeItem(at: url)
            }
        }
    }

    // MARK: - Stream URL (no download)

    static func fetchStreamURL(videoId: String, completion: @escaping (Result<URL, Swift.Error>) -> Void) {
        runCapturing(args: [
            "-f", "22/18/best[ext=mp4][acodec!=none]/best",
            "--no-playlist", "--no-warnings", "-g",
            videoURL(forId: videoId)
        ]) { result in
            DispatchQueue.main.async {
                switch result {
                case .failure(let e): completion(.failure(e))
                case .success(let data):
                    let str = (String(data: data, encoding: .utf8) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                    let firstLine = str.split(separator: "\n").first.map(String.init) ?? str
                    if let url = URL(string: firstLine) { completion(.success(url)) }
                    else { completion(.failure(Error.badJSON)) }
                }
            }
        }
    }
}

extension Notification.Name {
    static let videoCacheDidChange = Notification.Name("YouLearn.videoCacheDidChange")
}
