import AppKit
import CryptoKit

enum PasswordGate {
    private static let key = "YouLearn.passwordHash"

    static var isConfigured: Bool {
        UserDefaults.standard.string(forKey: key) != nil
    }

    static func setPassword(_ pw: String) {
        UserDefaults.standard.set(hash(pw), forKey: key)
    }

    static func verify(_ pw: String) -> Bool {
        guard let stored = UserDefaults.standard.string(forKey: key) else { return true }
        return stored == hash(pw)
    }

    private static func hash(_ s: String) -> String {
        let digest = SHA256.hash(data: Data(s.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    /// Modal prompt; returns true if the password matches (or none is set).
    static func unlock(over parent: NSWindow?) -> Bool {
        if !isConfigured { return true }
        let alert = NSAlert()
        alert.messageText = "Enter password"
        alert.informativeText = "Settings are protected."
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        let field = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 240, height: 24))
        alert.accessoryView = field
        alert.window.initialFirstResponder = field
        let response = alert.runModal()
        guard response == .alertFirstButtonReturn else { return false }
        if verify(field.stringValue) { return true }
        let bad = NSAlert()
        bad.messageText = "Incorrect password"
        bad.runModal()
        return false
    }

    static func promptInitialSetup() {
        let alert = NSAlert()
        alert.messageText = "Set a settings password"
        alert.informativeText = "This locks the Settings window. You can change it later."
        alert.addButton(withTitle: "Set")
        let field = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 240, height: 24))
        alert.accessoryView = field
        alert.window.initialFirstResponder = field
        _ = alert.runModal()
        let pw = field.stringValue
        if !pw.isEmpty { setPassword(pw) }
    }
}
