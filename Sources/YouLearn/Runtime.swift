import Foundation
import Darwin

/// On-demand runtime: a Python.framework + deno binary + pip-installed yt-dlp,
/// living in ~/Library/Application Support/YouLearn/runtime/. The app bundle
/// itself is small; this directory is populated on first launch by `install`.
enum Runtime {
    enum Phase: String, CaseIterable {
        case python = "Python"
        case deno = "JavaScript runtime"
        case ytdlp = "yt-dlp"
    }

    enum Error: Swift.Error, CustomStringConvertible {
        case http(Int)
        case missingPayload(String)
        case process(String, Int32, String)
        case unsupportedArch(String)

        var description: String {
            switch self {
            case .http(let c): return "HTTP \(c)"
            case .missingPayload(let s): return "Missing in download: \(s)"
            case .process(let path, let code, let out): return "\(path) exited \(code):\n\(out)"
            case .unsupportedArch(let m): return "Unsupported CPU arch: \(m)"
            }
        }
    }

    // MARK: - Versions (bump these to force a re-download on next launch)
    static let pythonVersion = "3.12.7"
    static let denoVersion = "v2.7.14"

    // MARK: - Paths

    static var dir: URL {
        let fm = FileManager.default
        let base = try! fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let d = base.appendingPathComponent("YouLearn/runtime", isDirectory: true)
        try? fm.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }
    static var pythonFramework: URL { dir.appendingPathComponent("Python.framework") }
    static var pythonBinary: URL { pythonFramework.appendingPathComponent("Versions/3.12/bin/python3") }
    static var pythonLibDir: URL { pythonFramework.appendingPathComponent("Versions/3.12/lib") }
    static var binDir: URL { dir.appendingPathComponent("bin") }
    static var denoBinary: URL { binDir.appendingPathComponent("deno") }
    static var sitePackages: URL { pythonFramework.appendingPathComponent("Versions/3.12/lib/python3.12/site-packages") }

    // MARK: - State

    static var hasPython: Bool { FileManager.default.isExecutableFile(atPath: pythonBinary.path) }
    static var hasDeno: Bool { FileManager.default.isExecutableFile(atPath: denoBinary.path) }
    static var hasYtDlp: Bool { FileManager.default.fileExists(atPath: sitePackages.appendingPathComponent("yt_dlp").path) }
    static var isInstalled: Bool { hasPython && hasDeno && hasYtDlp }

    static func uninstall() throws {
        try FileManager.default.removeItem(at: dir)
    }

    /// Environment dyld + PATH to launch the runtime python with yt-dlp loaded.
    static func processEnvironment() -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        env["DYLD_FRAMEWORK_PATH"] = dir.path
        env["DYLD_LIBRARY_PATH"] = pythonLibDir.path
        var pathParts = [binDir.path, "/usr/bin", "/bin"]
        if let existing = env["PATH"], !existing.isEmpty { pathParts.append(existing) }
        env["PATH"] = pathParts.joined(separator: ":")
        return env
    }

    // MARK: - Install

    /// Run a fresh install of any missing components. Calls `progress` on the
    /// main queue with (phase, fraction, status text). Calls `completion` on
    /// the main queue when done or failed.
    static func install(progress: @escaping (Phase, Double, String) -> Void,
                        completion: @escaping (Result<Void, Swift.Error>) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                if !hasPython { try installPython(progress: progress) }
                else { progress(.python, 1.0, "Already installed.") }
                if !hasDeno { try installDeno(progress: progress) }
                else { progress(.deno, 1.0, "Already installed.") }
                if !hasYtDlp { try installYtDlp(progress: progress) }
                else { progress(.ytdlp, 1.0, "Already installed.") }
                DispatchQueue.main.async { completion(.success(())) }
            } catch {
                DispatchQueue.main.async { completion(.failure(error)) }
            }
        }
    }

    // MARK: - Python

    private static func installPython(progress: @escaping (Phase, Double, String) -> Void) throws {
        let url = URL(string: "https://www.python.org/ftp/python/\(pythonVersion)/python-\(pythonVersion)-macos11.pkg")!
        let pkg = dir.appendingPathComponent("python.pkg")
        try downloadSync(url: url, to: pkg) { pct, downloaded, total in
            DispatchQueue.main.async {
                progress(.python, pct * 0.7, String(format: "Downloading Python %@: %@ / %@", pythonVersion, fmtMB(downloaded), fmtMB(total)))
            }
        }
        DispatchQueue.main.async { progress(.python, 0.75, "Extracting Python framework…") }
        let expanded = dir.appendingPathComponent("python_pkg")
        try? FileManager.default.removeItem(at: expanded)
        try run("/usr/sbin/pkgutil", ["--expand-full", pkg.path, expanded.path])
        let payload = expanded.appendingPathComponent("Python_Framework.pkg/Payload")
        guard FileManager.default.fileExists(atPath: payload.path) else {
            throw Error.missingPayload("Python_Framework.pkg/Payload")
        }
        try? FileManager.default.removeItem(at: pythonFramework)
        try FileManager.default.moveItem(at: payload, to: pythonFramework)
        try? FileManager.default.removeItem(at: pkg)
        try? FileManager.default.removeItem(at: expanded)
        DispatchQueue.main.async { progress(.python, 1.0, "Python ready.") }
    }

    // MARK: - Deno

    private static func installDeno(progress: @escaping (Phase, Double, String) -> Void) throws {
        guard let url = denoDownloadURL() else {
            var info = utsname(); _ = uname(&info)
            let machine = withUnsafePointer(to: &info.machine) {
                $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) }
            }
            throw Error.unsupportedArch(machine)
        }
        let zip = dir.appendingPathComponent("deno.zip")
        try downloadSync(url: url, to: zip) { pct, downloaded, total in
            DispatchQueue.main.async {
                progress(.deno, pct * 0.85, String(format: "Downloading deno %@: %@ / %@", denoVersion, fmtMB(downloaded), fmtMB(total)))
            }
        }
        DispatchQueue.main.async { progress(.deno, 0.9, "Extracting deno…") }
        try? FileManager.default.createDirectory(at: binDir, withIntermediateDirectories: true)
        let extractTmp = dir.appendingPathComponent("deno_tmp")
        try? FileManager.default.removeItem(at: extractTmp)
        try FileManager.default.createDirectory(at: extractTmp, withIntermediateDirectories: true)
        try run("/usr/bin/unzip", ["-q", zip.path, "-d", extractTmp.path])
        let extracted = extractTmp.appendingPathComponent("deno")
        try? FileManager.default.removeItem(at: denoBinary)
        try FileManager.default.moveItem(at: extracted, to: denoBinary)
        try? FileManager.default.removeItem(at: zip)
        try? FileManager.default.removeItem(at: extractTmp)
        // Re-sign so a hardened-runtime YouLearn (signed for distribution) can spawn it.
        _ = try? run("/usr/bin/codesign", ["--force", "-s", "-", denoBinary.path])
        DispatchQueue.main.async { progress(.deno, 1.0, "deno ready.") }
    }

    private static func denoDownloadURL() -> URL? {
        var info = utsname()
        guard uname(&info) == 0 else { return nil }
        let machine = withUnsafePointer(to: &info.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) }
        }
        let denoArch: String
        switch machine {
        case "arm64": denoArch = "aarch64"
        case "x86_64": denoArch = "x86_64"
        default: return nil
        }
        return URL(string: "https://github.com/denoland/deno/releases/download/\(denoVersion)/deno-\(denoArch)-apple-darwin.zip")
    }

    // MARK: - yt-dlp

    private static func installYtDlp(progress: @escaping (Phase, Double, String) -> Void) throws {
        DispatchQueue.main.async { progress(.ytdlp, 0.1, "Bootstrapping pip…") }
        try runPython(["-m", "ensurepip", "--upgrade"])
        DispatchQueue.main.async { progress(.ytdlp, 0.4, "Installing yt-dlp…") }
        try runPython(["-m", "pip", "install", "--upgrade", "--quiet", "--disable-pip-version-check", "pip", "yt-dlp", "certifi"])
        DispatchQueue.main.async { progress(.ytdlp, 1.0, "yt-dlp installed.") }
    }

    // MARK: - Process helpers

    private static func runPython(_ args: [String]) throws {
        try run(pythonBinary.path, args, env: processEnvironment())
    }

    @discardableResult
    private static func run(_ path: String, _ args: [String], env: [String: String]? = nil) throws -> String {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: path)
        p.arguments = args
        if let env = env { p.environment = env }
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = pipe
        try p.run()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        let out = String(data: data, encoding: .utf8) ?? ""
        if p.terminationStatus != 0 {
            throw Error.process(path, p.terminationStatus, out)
        }
        return out
    }

    // MARK: - Download helper

    /// Synchronous download with progress (must be called from a background queue).
    private static func downloadSync(url: URL, to dst: URL, onProgress: @escaping (Double, Int64, Int64) -> Void) throws {
        let sem = DispatchSemaphore(value: 0)
        var resultError: Swift.Error?
        let d = SyncDownloader(url: url, dst: dst, onProgress: onProgress) { result in
            if case .failure(let e) = result { resultError = e }
            sem.signal()
        }
        d.start()
        sem.wait()
        if let e = resultError { throw e }
    }

    private static func fmtMB(_ bytes: Int64) -> String {
        guard bytes > 0 else { return "?" }
        return String(format: "%.1f MB", Double(bytes) / 1_000_000)
    }
}

/// Internal — owns the URLSession and exposes a single-shot download with progress.
private final class SyncDownloader: NSObject, URLSessionDownloadDelegate {
    let url: URL
    let dst: URL
    let onProgress: (Double, Int64, Int64) -> Void
    let onDone: (Result<Void, Error>) -> Void
    private var session: URLSession!

    init(url: URL, dst: URL, onProgress: @escaping (Double, Int64, Int64) -> Void, onDone: @escaping (Result<Void, Error>) -> Void) {
        self.url = url; self.dst = dst; self.onProgress = onProgress; self.onDone = onDone
        super.init()
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForResource = 600
        self.session = URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
    }

    func start() {
        session.downloadTask(with: url).resume()
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                    didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        let pct = totalBytesExpectedToWrite > 0 ? Double(totalBytesWritten) / Double(totalBytesExpectedToWrite) : 0
        onProgress(pct, totalBytesWritten, totalBytesExpectedToWrite)
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        do {
            try? FileManager.default.removeItem(at: dst)
            try FileManager.default.moveItem(at: location, to: dst)
            session.finishTasksAndInvalidate()
            onDone(.success(()))
        } catch {
            onDone(.failure(error))
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            onDone(.failure(error))
        }
    }
}
