import AppKit

enum ErrorReporter {
    /// Show a window with the full error message in a selectable, scrollable text view.
    /// yt-dlp/Python tracebacks are long and need to be copyable for debugging.
    static func show(title: String, error: Error) {
        let message = format(error)
        DispatchQueue.main.async { presentWindow(title: title, body: message) }
    }

    static func show(title: String, body: String) {
        DispatchQueue.main.async { presentWindow(title: title, body: body) }
    }

    private static func format(_ error: Error) -> String {
        if let api = error as? YouTubeAPI.Error {
            return api.description
        }
        if let yt = error as? YTDLP.Error {
            switch yt {
            case .binaryMissing: return "yt-dlp binary not found."
            case .nonZeroExit(let code, let stderr):
                return "yt-dlp exited with code \(code).\n\n\(stderr)"
            case .badJSON: return "Could not parse yt-dlp JSON output."
            case .missingFile: return "yt-dlp finished but no output file was found."
            }
        }
        return String(describing: error)
    }

    private static func presentWindow(title: String, body: String) {
        let win = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 640, height: 360),
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered, defer: false)
        win.title = title
        win.center()
        win.isReleasedWhenClosed = false

        let content = NSView()

        let scroll = NSScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.hasVerticalScroller = true
        scroll.hasHorizontalScroller = false
        scroll.borderType = .bezelBorder

        let textView = NSTextView()
        textView.isEditable = false
        textView.isSelectable = true
        textView.drawsBackground = true
        textView.backgroundColor = .textBackgroundColor
        textView.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        textView.string = body
        textView.textContainerInset = NSSize(width: 6, height: 6)
        textView.autoresizingMask = [.width]
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.textContainer?.widthTracksTextView = true
        scroll.documentView = textView

        let copyTarget = CopyTarget(text: body)
        let copyBtn = NSButton(title: "Copy", target: copyTarget, action: #selector(CopyTarget.copy(_:)))
        copyBtn.translatesAutoresizingMaskIntoConstraints = false
        objc_setAssociatedObject(copyBtn, &copyTargetKey, copyTarget, .OBJC_ASSOCIATION_RETAIN)

        let closeBtn = NSButton(title: "Close", target: win, action: #selector(NSWindow.performClose(_:)))
        closeBtn.translatesAutoresizingMaskIntoConstraints = false
        closeBtn.keyEquivalent = "\r"

        let buttons = NSStackView(views: [copyBtn, closeBtn])
        buttons.translatesAutoresizingMaskIntoConstraints = false
        buttons.orientation = .horizontal
        buttons.spacing = 8

        content.addSubview(scroll)
        content.addSubview(buttons)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: content.topAnchor, constant: 12),
            scroll.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 12),
            scroll.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -12),
            scroll.bottomAnchor.constraint(equalTo: buttons.topAnchor, constant: -8),
            buttons.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -12),
            buttons.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -12),
        ])

        win.contentView = content
        win.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

private var copyTargetKey: UInt8 = 0

private final class CopyTarget: NSObject {
    let text: String
    init(text: String) { self.text = text }

    @objc func copy(_ sender: Any?) {
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setString(text, forType: .string)
    }
}
