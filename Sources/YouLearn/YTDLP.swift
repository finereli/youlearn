import Foundation

/// Facade for video metadata + downloads.
///
/// Metadata flows through `YouTubeAPI` (official Data API).
/// Downloads shell out to a yt-dlp zipapp running on the bundled Python
/// framework — see Resources/Frameworks/Python.framework, set up by build.sh.
enum YTDLP {
    enum Error: Swift.Error { case binaryMissing, nonZeroExit(Int32, String), badJSON, missingFile }

    // MARK: - Metadata

    struct PlaylistMeta {
        let title: String
        let videos: [Video]
    }

    static func fetchPlaylistMetadata(url: String, completion: @escaping (Result<PlaylistMeta, Swift.Error>) -> Void) {
        guard let plId = YouTubeAPI.extractPlaylistId(from: url) else {
            completion(.failure(Error.badJSON)); return
        }
        YouTubeAPI.fetchPlaylist(id: plId) { result in
            switch result {
            case .failure(let e): completion(.failure(e))
            case .success(let pair): completion(.success(PlaylistMeta(title: pair.title, videos: pair.videos)))
            }
        }
    }

    static func fetchVideoMetadata(url: String, completion: @escaping (Result<Video, Swift.Error>) -> Void) {
        guard let id = YouTubeAPI.extractVideoId(from: url) else {
            completion(.failure(Error.badJSON)); return
        }
        YouTubeAPI.fetchVideo(id: id, completion: completion)
    }

    static func videoURL(forId id: String) -> String { "https://www.youtube.com/watch?v=\(id)" }

    // MARK: - Cache helpers

    static func findCachedFile(videoId: String, in dir: URL) -> URL? {
        let fm = FileManager.default
        guard let items = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return nil }
        return items.first {
            let name = $0.lastPathComponent
            guard name.hasPrefix(videoId + ".") else { return false }
            if name.hasSuffix(".part") || name.contains(".part.") || name.hasSuffix(".ytdl") { return false }
            if name.hasSuffix(".vtt") || name.hasSuffix(".srt") { return false }
            return true
        }
    }

    static func findSubtitleFile(videoId: String, in dir: URL) -> URL? {
        let fm = FileManager.default
        guard let items = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return nil }
        return items.first {
            let name = $0.lastPathComponent
            return name.hasPrefix(videoId + ".") && name.hasSuffix(".vtt")
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

    // MARK: - Download

    @discardableResult
    static func download(videoId: String,
                         to destinationDir: URL,
                         progress: @escaping (Double, Int64, Int64, String) -> Void,
                         completion: @escaping (Result<URL, Swift.Error>) -> Void) -> Process? {
        guard Runtime.isInstalled else {
            completion(.failure(Error.binaryMissing)); return nil
        }
        try? FileManager.default.createDirectory(at: destinationDir, withIntermediateDirectories: true)
        let outputTemplate = destinationDir.appendingPathComponent("%(id)s.%(ext)s").path

        let p = Process()
        p.executableURL = Runtime.pythonBinary
        p.environment = Runtime.processEnvironment()
        p.arguments = [
            "-m", "yt_dlp",
            // 360p combined mp4 — itag 18 is universally available and needs no
            // muxing. See docs/hd-experiment.md for why we don't go higher.
            "-f", "18/best[ext=mp4][acodec!=none]/best",
            "--no-playlist",
            "--newline",
            // Lets yt-dlp fetch the EJS challenge-solver script from the
            // yt-dlp/ejs GitHub release on first use (cached afterwards).
            // Without it, n-param solving fails on most modern videos.
            "--remote-components", "ejs:github",
            // Subtitles: best-effort. en variants only, and don't abort the
            // whole download if a single language variant rate-limits (e.g. 429).
            "--write-subs", "--write-auto-subs",
            "--sub-langs", "en,en-US,en-GB",
            "--sub-format", "vtt/best",
            "--convert-subs", "vtt",
            "--no-abort-on-error",
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

}

extension Notification.Name {
    static let videoCacheDidChange = Notification.Name("YouLearn.videoCacheDidChange")
    static let selectPlaylist = Notification.Name("YouLearn.selectPlaylist")
}
