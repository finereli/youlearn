import AppKit

final class MainWindowController: NSWindowController {
    convenience init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1100, height: 700),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = "YouLearn"
        window.center()
        window.setFrameAutosaveName("YouLearnMain")
        self.init(window: window)

        let split = NSSplitViewController()
        split.splitView.dividerStyle = .thin

        let sidebar = SidebarViewController()
        let player = PlayerViewController()
        sidebar.onSelectVideo = { [weak player] context in player?.play(context: context) }

        let sidebarItem = NSSplitViewItem(sidebarWithViewController: sidebar)
        sidebarItem.minimumThickness = 240
        sidebarItem.maximumThickness = 420
        let playerItem = NSSplitViewItem(viewController: player)
        playerItem.minimumThickness = 500

        split.addSplitViewItem(sidebarItem)
        split.addSplitViewItem(playerItem)

        window.contentViewController = split
    }
}
