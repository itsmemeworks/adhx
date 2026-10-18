import SwiftUI

/// The networks ADHX saves from, by the server's platform id.
enum Network {
    static let names: [String: String] = [
        "twitter": "X",
        "instagram": "Instagram",
        "tiktok": "TikTok",
        "youtube": "YouTube",
        "facebook": "Facebook",
        "reddit": "Reddit",
        "linkedin": "LinkedIn",
        "vimeo": "Vimeo",
        "soundcloud": "SoundCloud",
        "pinterest": "Pinterest",
        "twitch": "Twitch",
        "threads": "Threads",
        "imgur": "Imgur",
        "bluesky": "Bluesky",
    ]

    static func name(_ platform: String?) -> String {
        guard let platform else { return "Link" }
        return names[platform] ?? "Link"
    }

    /// Networks whose posts are mostly wide video, so the poster is landscape.
    static func isWide(_ platform: String?) -> Bool {
        ["youtube", "vimeo", "twitch"].contains(platform ?? "")
    }

    /// Networks where the words are a better title than the handle.
    static func titleIsWords(_ platform: String?) -> Bool {
        ["youtube", "reddit", "vimeo", "pinterest", "soundcloud", "imgur", "twitch"].contains(platform ?? "")
    }

    /// Guesses the network from a link's host, before the server answers.
    static func guess(from link: String) -> String? {
        guard let host = URL(string: link)?.host?.lowercased() else { return nil }
        let h = host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
        func on(_ domain: String) -> Bool { h == domain || h.hasSuffix("." + domain) }

        if on("x.com") || on("twitter.com") || on("t.co") { return "twitter" }
        if on("instagram.com") || on("instagr.am") { return "instagram" }
        if on("tiktok.com") { return "tiktok" }  // includes vm. and vt.
        if on("youtube.com") || on("youtu.be") || on("youtube-nocookie.com") { return "youtube" }
        if on("facebook.com") || on("fb.watch") || on("fb.com") { return "facebook" }
        if on("reddit.com") || on("redd.it") { return "reddit" }
        if on("linkedin.com") || on("lnkd.in") { return "linkedin" }
        if on("vimeo.com") { return "vimeo" }
        if on("soundcloud.com") { return "soundcloud" }  // includes on.soundcloud.com
        if on("pin.it") || h.hasPrefix("pinterest.") || h.contains(".pinterest.") { return "pinterest" }
        if on("twitch.tv") { return "twitch" }
        if on("threads.net") || on("threads.com") { return "threads" }
        if on("imgur.com") { return "imgur" }
        if on("bsky.app") { return "bluesky" }
        return nil
    }
}

/// A network's mark, drawn in one colour. Unknown networks get a link glyph.
struct NetworkMark: View {
    let platform: String?
    var size: CGFloat = 18
    var color: Color = .white

    var body: some View {
        Group {
            if let platform, let data = NetworkPaths.byPlatform[platform] {
                SVGShape(data: data).fill(color)
            } else if platform == "linkedin" {
                // LinkedIn asked Simple Icons not to carry its logo; spell the name's start instead.
                RoundedRectangle(cornerRadius: size * 4 / 24, style: .continuous)
                    .fill(color)
                    .padding(size * 1.5 / 24)
                    .overlay(
                        Text("in")
                            .font(.system(size: size * 13.5 / 24, weight: .bold))
                            .foregroundStyle(Color.black)
                            .offset(y: size * 0.02)
                    )
            } else {
                Image(systemName: "link")
                    .resizable()
                    .scaledToFit()
                    .fontWeight(.bold)
                    .foregroundStyle(color)
                    .padding(size * 0.08)
            }
        }
        .frame(width: size, height: size)
        .accessibilityLabel(Network.name(platform))
    }
}

/// The black tile with a network mark, as in the Shared lately list.
struct NetworkTile: View {
    let platform: String?
    var body: some View {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(Color.black)
            .frame(width: 40, height: 40)
            .overlay(NetworkMark(platform: platform, size: 18))
    }
}
