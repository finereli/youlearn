import AppKit

/// Modal-ish window shown on first launch (or after the runtime is wiped).
/// Drives `Runtime.install` and reports per-phase progress; calls back when
/// installation succeeds or the user quits.
final class FirstRunWindowController: NSWindowController {
    private let titleLabel = NSTextField(labelWithString: "Setting up YouLearn")
    private let subtitleLabel = NSTextField(wrappingLabelWithString: "Downloading the runtime needed to fetch videos. About 200 MB; one-time.")
    private let statusLabel = NSTextField(labelWithString: "Starting…")
    private let quitButton = NSButton(title: "Quit", target: nil, action: nil)

    private var rows: [Runtime.Phase: PhaseRow] = [:]

    private var onSuccess: (() -> Void)?
    private var onCancel: (() -> Void)?

    convenience init() {
        let win = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 480, height: 280),
            styleMask: [.titled],
            backing: .buffered, defer: false)
        win.title = ""
        win.center()
        win.isReleasedWhenClosed = false
        self.init(window: win)
        buildUI()
    }

    func runInstall(onSuccess: @escaping () -> Void, onCancel: @escaping () -> Void) {
        self.onSuccess = onSuccess
        self.onCancel = onCancel
        showWindow(nil)
        NSApp.activate(ignoringOtherApps: true)
        Runtime.install(progress: { [weak self] phase, fraction, status in
            self?.rows[phase]?.update(fraction: fraction)
            self?.statusLabel.stringValue = status
        }, completion: { [weak self] result in
            switch result {
            case .success:
                self?.window?.close()
                self?.onSuccess?()
            case .failure(let err):
                self?.statusLabel.stringValue = "Failed: \(err)"
                self?.quitButton.title = "Quit"
                ErrorReporter.show(title: "Setup failed", error: err)
            }
        })
    }

    private func buildUI() {
        let content = NSView()

        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.font = .systemFont(ofSize: 18, weight: .semibold)

        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        subtitleLabel.textColor = .secondaryLabelColor
        subtitleLabel.maximumNumberOfLines = 2

        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.font = .systemFont(ofSize: 11)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.maximumNumberOfLines = 1
        statusLabel.lineBreakMode = .byTruncatingTail

        quitButton.translatesAutoresizingMaskIntoConstraints = false
        quitButton.target = self
        quitButton.action = #selector(quitClicked)

        let phasesStack = NSStackView()
        phasesStack.translatesAutoresizingMaskIntoConstraints = false
        phasesStack.orientation = .vertical
        phasesStack.alignment = .leading
        phasesStack.spacing = 10
        for phase in Runtime.Phase.allCases {
            let row = PhaseRow(phase: phase)
            rows[phase] = row
            phasesStack.addArrangedSubview(row)
            row.widthAnchor.constraint(equalTo: phasesStack.widthAnchor).isActive = true
        }

        content.addSubview(titleLabel)
        content.addSubview(subtitleLabel)
        content.addSubview(phasesStack)
        content.addSubview(statusLabel)
        content.addSubview(quitButton)

        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: content.topAnchor, constant: 20),
            titleLabel.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 24),
            titleLabel.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -24),

            subtitleLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 4),
            subtitleLabel.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            subtitleLabel.trailingAnchor.constraint(equalTo: titleLabel.trailingAnchor),

            phasesStack.topAnchor.constraint(equalTo: subtitleLabel.bottomAnchor, constant: 16),
            phasesStack.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            phasesStack.trailingAnchor.constraint(equalTo: titleLabel.trailingAnchor),

            statusLabel.topAnchor.constraint(equalTo: phasesStack.bottomAnchor, constant: 16),
            statusLabel.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            statusLabel.trailingAnchor.constraint(equalTo: titleLabel.trailingAnchor),

            quitButton.topAnchor.constraint(greaterThanOrEqualTo: statusLabel.bottomAnchor, constant: 12),
            quitButton.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -20),
            quitButton.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -16),
        ])
        window?.contentView = content
    }

    @objc private func quitClicked() {
        window?.close()
        onCancel?()
    }
}

private final class PhaseRow: NSView {
    let label = NSTextField(labelWithString: "")
    let bar = NSProgressIndicator()

    init(phase: Runtime.Phase) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        label.translatesAutoresizingMaskIntoConstraints = false
        label.stringValue = phase.rawValue
        label.font = .systemFont(ofSize: 12, weight: .medium)
        bar.translatesAutoresizingMaskIntoConstraints = false
        bar.style = .bar
        bar.isIndeterminate = false
        bar.minValue = 0
        bar.maxValue = 1
        addSubview(label)
        addSubview(bar)
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: topAnchor),
            label.leadingAnchor.constraint(equalTo: leadingAnchor),
            label.widthAnchor.constraint(equalToConstant: 140),
            bar.centerYAnchor.constraint(equalTo: label.centerYAnchor),
            bar.leadingAnchor.constraint(equalTo: label.trailingAnchor, constant: 8),
            bar.trailingAnchor.constraint(equalTo: trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }
    required init?(coder: NSCoder) { fatalError() }

    func update(fraction: Double) {
        bar.doubleValue = max(0, min(1, fraction))
    }
}
