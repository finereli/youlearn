import Foundation

struct SubtitleCue {
    let start: Double
    let end: Double
    let text: String
}

enum VTTParser {
    /// Parse a WebVTT file into ordered, non-overlapping-display cues.
    /// YouTube auto-captions repeat lines across consecutive cues to create a
    /// scrolling effect; we collapse those by deduping text against the prior cue.
    static func parse(_ url: URL) -> [SubtitleCue] {
        guard let raw = try? String(contentsOf: url, encoding: .utf8) else { return [] }
        var cues: [SubtitleCue] = []
        let lines = raw.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
        var i = 0
        while i < lines.count {
            let line = lines[i]
            if let arrow = line.range(of: "-->") {
                let startStr = String(line[..<arrow.lowerBound]).trimmingCharacters(in: .whitespaces)
                let afterArrow = String(line[arrow.upperBound...]).trimmingCharacters(in: .whitespaces)
                let endStr = afterArrow.split(separator: " ").first.map(String.init) ?? afterArrow
                let start = parseTimestamp(startStr)
                let end = parseTimestamp(endStr)
                i += 1
                var textLines: [String] = []
                while i < lines.count, !lines[i].isEmpty {
                    textLines.append(stripTags(lines[i]))
                    i += 1
                }
                let text = textLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty, end > start {
                    if let prior = cues.last, prior.text == text {
                        cues[cues.count - 1] = SubtitleCue(start: prior.start, end: end, text: text)
                    } else {
                        cues.append(SubtitleCue(start: start, end: end, text: text))
                    }
                }
            }
            i += 1
        }
        return cues
    }

    private static func parseTimestamp(_ s: String) -> Double {
        let parts = s.split(separator: ":")
        guard !parts.isEmpty else { return 0 }
        var h = 0.0, m = 0.0, sec = 0.0
        if parts.count == 3 {
            h = Double(parts[0]) ?? 0
            m = Double(parts[1]) ?? 0
            sec = Double(parts[2].replacingOccurrences(of: ",", with: ".")) ?? 0
        } else if parts.count == 2 {
            m = Double(parts[0]) ?? 0
            sec = Double(parts[1].replacingOccurrences(of: ",", with: ".")) ?? 0
        } else {
            sec = Double(parts[0].replacingOccurrences(of: ",", with: ".")) ?? 0
        }
        return h * 3600 + m * 60 + sec
    }

    private static func stripTags(_ s: String) -> String {
        var out = ""
        var inTag = false
        for ch in s {
            if ch == "<" { inTag = true; continue }
            if ch == ">" { inTag = false; continue }
            if !inTag { out.append(ch) }
        }
        return out
    }
}
