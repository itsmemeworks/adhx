import SwiftUI

/// New's lineup on the phone (boards 13.3 and 13.5): a strip under the tabs
/// says which part is playing, a pill above the byline says where you are
/// in it and opens Up next, the whole lineup in its three parts.

/// "Just saved 2 · Not seen yet 6 · For you": the parts with posts in them,
/// the one playing lit, its bar filling as you go.
struct LineupStrip: View {
    let parts: [LineupSection]
    let counts: [LineupSection: Int]
    let spot: FeedModel.LineupSpot?

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            ForEach(parts, id: \.self) { part in
                let state = state(of: part)
                VStack(alignment: .leading, spacing: 6) {
                    GeometryReader { proxy in
                        ZStack(alignment: .leading) {
                            Capsule().fill(.white.opacity(0.22))
                            Capsule().fill(Theme.accent)
                                .frame(width: proxy.size.width * state.fill)
                        }
                    }
                    .frame(height: 4)
                    .shadow(color: .black.opacity(0.6), radius: 1.5, y: 1)
                    Text(label(part))
                        .font(Theme.sans(12, state.current ? .heavy : .semibold))
                        .foregroundStyle(state.current ? Theme.ink : Color(hex: 0xE8E0CF))
                        .lineLimit(1)
                        .overMediaShadow(true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibility)
    }

    private func label(_ part: LineupSection) -> String {
        part == .foryou ? part.title : "\(part.title) \(counts[part] ?? 0)"
    }

    /// Past parts are full, the playing one fills with where you are, later ones are empty.
    private func state(of part: LineupSection) -> (fill: CGFloat, current: Bool) {
        guard let spot, let at = parts.firstIndex(of: spot.section), let mine = parts.firstIndex(of: part) else {
            return (0, false)
        }
        if mine < at { return (1, false) }
        if mine > at { return (0, false) }
        return (CGFloat(spot.position) / CGFloat(max(spot.count, 1)), true)
    }

    private var accessibility: String {
        let list = parts.map(label).joined(separator: ", then ")
        guard let spot else { return "Today’s lineup: \(list)" }
        return "Today’s lineup: \(list). Playing \(spot.section.title), \(spot.position) of \(spot.count)."
    }
}

/// "Just saved · 1 of 2" above the byline: opens Up next.
struct LineupPill: View {
    let spot: FeedModel.LineupSpot
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 8) {
                Image(systemName: "list.bullet")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.accent)
                Text(spot.section.title)
                    .font(Theme.sans(14, .heavy))
                    .foregroundStyle(Theme.ink)
                Text("· \(spot.position) of \(spot.count)")
                    .font(Theme.sans(14))
                    .foregroundStyle(Theme.muted)
                Image(systemName: "chevron.up")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.muted)
            }
            .lineLimit(1)
            .padding(.leading, 10)
            .padding(.trailing, 12)
            .frame(height: 40)
            .frosted(Capsule(), dim: 0.55)
            .overlay(Capsule().strokeBorder(.white.opacity(0.14), lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(spot.section.title), \(spot.position) of \(spot.count). Open Up next")
    }
}

/// Up next: the lineup in its three parts. Always in this order; tap any
/// post to start there.
struct UpNextSheet: View {
    @ObservedObject var feed: FeedModel
    let server: URL
    let jump: (String) -> Void
    @Environment(\.boardDismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Up next")
                    .font(Theme.serif(34))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 8)
                Text(aside)
                    .font(Theme.sans(13))
                    .foregroundStyle(Theme.faint)
            }
            Text("Always in this order. Tap any post to start there.")
                .font(Theme.sans(14))
                .foregroundStyle(Theme.muted)
            ScrollViewReader { reader in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 4, pinnedViews: []) {
                        ForEach(feed.lineupParts, id: \.self) { part in
                            heading(part)
                            ForEach(Array(rows(part)), id: \.post.key) { row in
                                let playing = row.index == feed.currentIndex
                                let watched = feed.watched.contains(row.post.key)
                                UpNextRow(post: row.post, server: server, playing: playing, watched: watched,
                                          dot: part.isUnseen && !watched && !playing,
                                          chip: part == .foryou ? row.post.why : nil) {
                                    jump(row.post.key)
                                    dismiss?()
                                }
                                .id(row.post.key)
                                .onAppear { feed.loadMoreIfNeeded(at: row.index) }
                            }
                        }
                    }
                }
                .scrollIndicators(.hidden)
                .onAppear {
                    if let key = feed.currentKey { reader.scrollTo(key, anchor: .center) }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    private var aside: String {
        let left = feed.unseenLeft
        return left == 0 ? "Nothing new to see" : left == 1 ? "1 not seen yet" : "\(left) not seen yet"
    }

    private func rows(_ part: LineupSection) -> [(index: Int, post: PhonePost)] {
        feed.items.enumerated().compactMap { $0.element.section == part ? ($0.offset, $0.element) : nil }
    }

    private func heading(_ part: LineupSection) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(part.title.uppercased())
                .font(Theme.sans(12, .heavy))
                .tracking(1)
                .foregroundStyle(Theme.accent)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            Text(part == .foryou ? "from what you keep" : "\(feed.sections?[part] ?? 0)")
                .font(Theme.sans(12, .semibold))
                .foregroundStyle(Theme.faint)
        }
        .padding(.horizontal, 4)
        .padding(.top, 12)
        .padding(.bottom, 4)
    }
}

/// Up next for any other queue (board 14.3, 14.4): a channel newest first,
/// a search best match first. One list; tap any post to start there.
struct QueueSheet: View {
    let posts: [PhonePost]
    let current: Int
    let server: URL
    /// "Ana’s saves", "“synth”".
    let name: String
    /// How the list is ordered, in a line.
    let note: String
    /// Posts watched while this player has been up (dimmed).
    let watched: Set<String>
    /// A chip under a post: how a search matched it.
    var chip: (PhonePost) -> String? = { _ in nil }
    var nearEnd: (Int) -> Void = { _ in }
    let jump: (String) -> Void
    @Environment(\.boardDismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Up next")
                    .font(Theme.serif(34))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 8)
                Text("\(name) · \(posts.count)")
                    .font(Theme.sans(13))
                    .foregroundStyle(Theme.faint)
                    .lineLimit(1)
            }
            Text(note)
                .font(Theme.sans(14))
                .foregroundStyle(Theme.muted)
            ScrollViewReader { reader in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(posts.enumerated()), id: \.element.key) { index, post in
                            let playing = index == current
                            let seen = watched.contains(post.key)
                            UpNextRow(post: post, server: server, playing: playing, watched: seen,
                                      dot: post.isNew == true && !seen && !playing, chip: chip(post)) {
                                jump(post.key)
                                dismiss?()
                            }
                            .id(post.key)
                            .onAppear { nearEnd(index) }
                        }
                    }
                    .padding(.top, 4)
                }
                .scrollIndicators(.hidden)
                .onAppear {
                    if current < posts.count { reader.scrollTo(posts[current].key, anchor: .center) }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }
}

/// "Ana’s saves · 3 of 24" above the byline in a channel or a search: opens Up next.
struct QueuePill: View {
    let name: String
    let position: Int
    let count: Int
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 8) {
                Image(systemName: "list.bullet")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.accent)
                Text(name)
                    .font(Theme.sans(14, .heavy))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Text("· \(position) of \(count)")
                    .font(Theme.sans(14))
                    .foregroundStyle(Theme.muted)
                    .fixedSize()
                Image(systemName: "chevron.up")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.muted)
            }
            .padding(.leading, 10)
            .padding(.trailing, 12)
            .frame(height: 40)
            .frosted(Capsule(), dim: 0.55)
            .overlay(Capsule().strokeBorder(.white.opacity(0.14), lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(name), \(position) of \(count). Open Up next")
    }
}

/// One post in Up next: a dot while you haven't seen it, its picture, its
/// words and who saved it; a chip for why (For you) or how it matched (search).
struct UpNextRow: View {
    let post: PhonePost
    let server: URL
    let playing: Bool
    /// Watched while this player has been up: dimmed, no dot.
    let watched: Bool
    /// You haven't seen it.
    let dot: Bool
    var chip: String?
    let tap: () -> Void

    private var unseen: Bool { dot }
    private var passed: Bool { watched && !playing }

    var body: some View {
        Button(action: tap) {
            HStack(spacing: 12) {
                Circle()
                    .fill(unseen ? Theme.accent : .clear)
                    .frame(width: 10, height: 10)
                    .accessibilityHidden(true)
                AuthImage(url: ADHXClient.resolve(post.posterUrl, against: server)) {
                    ZStack {
                        Theme.placeholder
                        NetworkMark(platform: post.platform, size: 18)
                    }
                }
                .frame(width: 52, height: 52)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    if playing {
                        Text("NOW PLAYING")
                            .font(Theme.sans(11, .heavy))
                            .tracking(0.6)
                            .foregroundStyle(Theme.accent)
                    }
                    Text(title)
                        .font(Theme.sans(15, .bold))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        if let saver = SaverWords.ordered(post.savers).first {
                            Face(saver: saver, server: server, size: 18, ring: .clear)
                        }
                        Text(meta)
                            .font(Theme.sans(13))
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                    }
                    if let chip {
                        Text(chip)
                            .font(Theme.sans(12, .bold))
                            .foregroundStyle(Theme.cream)
                            .lineLimit(1)
                            .padding(.horizontal, 8)
                            .frame(height: 22)
                            .background(Capsule().fill(Theme.raised))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .opacity(passed ? 0.62 : 1)
            .padding(.vertical, 8)
            .padding(.leading, 8)
            .padding(.trailing, 10)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(playing ? Theme.accent.opacity(0.10) : .clear))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(playing ? Theme.accent.opacity(0.35) : .clear, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibility)
        .accessibilityAddTraits(playing ? .isSelected : [])
    }

    /// The post's own words, else whose it is.
    private var title: String {
        if let line = Format.firstLine(post.article?.title ?? post.text) { return line }
        let noun = post.kind == "photo" ? "photo" : post.plays ? "video" : "post"
        return "@\(post.author.handle)’s \(noun)"
    }

    /// "Ana saved · 12m · YouTube", or "Ana sent you this · YouTube" (a
    /// send counts from when it was sent, which is why it's this high).
    private var meta: String {
        var parts: [String] = []
        if let sent = post.whyReasons.first, sent.kind == "sent" {
            return [sent.text, Network.name(post.platform)].joined(separator: " · ")
        }
        let savers = SaverWords.ordered(post.savers)
        if let first = savers.first {
            parts.append("\(first.isYou ? "You" : first.displayName) saved")
            if let at = first.savedAt.flatMap(Format.parseISO) { parts.append(Format.ago(at)) }
        }
        parts.append(Network.name(post.platform))
        return parts.joined(separator: " · ")
    }

    private var accessibility: String {
        var words = [title, meta]
        if playing { words.insert("Now playing", at: 0) } else if unseen { words.append("not seen yet") }
        if let chip { words.append(chip) }
        return words.joined(separator: ", ")
    }
}
