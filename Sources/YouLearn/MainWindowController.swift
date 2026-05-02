import AppKit

final class MainWindowController: NSWindowController {
    convenience init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1100, height: 700),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = "YouLearn"
        window.center()
        self.init(window: window)

        let split = NSSplitViewController()
        split.splitView.dividerStyle = .thin

        let sidebar = SidebarViewController()
        let player = BrowserPlayerViewController()
        sidebar.onSelectVideo = { [weak player] ctx in player?.play(context: ctx) }

        let sidebarItem = NSSplitViewItem(sidebarWithViewController: sidebar)
        sidebarItem.minimumThickness = 240
        sidebarItem.maximumThickness = 420
        let playerItem = NSSplitViewItem(viewController: player)
        playerItem.minimumThickness = 500

        split.addSplitViewItem(sidebarItem)
        split.addSplitViewItem(playerItem)

        window.contentViewController = split
        // Autosave name set last — `contentViewController =` resizes the window
        // to fit the content view, which would otherwise overwrite the saved frame.
        window.setFrameAutosaveName("YouLearnMain")
    }
}
