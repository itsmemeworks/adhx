import Foundation

/// Post words with their links tappable: each web address becomes a link,
/// shown short ("example.com/post") so it doesn't take over the caption.
/// The server has already swapped t.co links for where they go.
enum LinkedText {
    private static let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)

    static func attributed(_ raw: String) -> AttributedString {
        let text = decodeEntities(raw)
        guard let detector else { return AttributedString(text) }
        let whole = text as NSString
        var out = AttributedString()
        var from = 0
        for match in detector.matches(in: text, range: NSRange(location: 0, length: whole.length)) {
            guard let url = match.url, let scheme = url.scheme?.lowercased(),
                  scheme == "http" || scheme == "https" else { continue }
            if match.range.location > from {
                out += AttributedString(whole.substring(with: NSRange(location: from, length: match.range.location - from)))
            }
            var link = AttributedString(short(url))
            link.link = url
            out += link
            from = match.range.location + match.range.length
        }
        if from < whole.length { out += AttributedString(whole.substring(from: from)) }
        return out
    }

    /// "&amp;" → "&" and friends, for words from an ADHX older than the one
    /// that decodes them itself.
    static func decodeEntities(_ text: String) -> String {
        guard text.contains("&") else { return text }
        var out = text
        for (entity, char) in [("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&#39;", "'"), ("&apos;", "'"),
                               ("&nbsp;", " "), ("&amp;", "&")] {
            out = out.replacingOccurrences(of: entity, with: char)
        }
        return out
    }

    /// "example.com/a/long/pa…": the site and the start of the path.
    static func short(_ url: URL) -> String {
        let host = (url.host ?? url.absoluteString).replacingOccurrences(of: "^www\\.", with: "", options: .regularExpression)
        let path = url.path == "/" ? "" : url.path
        let words = host + path
        return words.count > 34 ? String(words.prefix(33)) + "…" : words
    }
}
