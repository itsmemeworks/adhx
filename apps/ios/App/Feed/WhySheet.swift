import SwiftUI

/// "Why this one": the reasons the feed gives for a post, and whose saves New
/// plays (Everyone · Friends only · Mine).
struct WhySheet: View {
    let post: PhonePost
    let server: URL
    let mode: FeedMode
    let choose: (FeedMode) -> Void
    /// Opens "What's in your feed".
    var filter: () -> Void = {}
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Why this one")
                        .font(Theme.serif(40))
                        .foregroundStyle(.white)
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 0)
                    CloseButton { dismiss() }
                }
                postRow
                VStack(spacing: 4) {
                    ForEach(Array(reasons.enumerated()), id: \.offset) { index, reason in
                        ReasonRow(reason: reason, lead: index == 0, server: server)
                    }
                }
                WhoseSaves(mode: mode) { picked in
                    choose(picked)
                    dismiss()
                }
                .padding(.top, 4)
                Button {
                    dismiss()
                    // After this sheet has gone, so the next one can come up.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { filter() }
                } label: {
                    Label("Filter", systemImage: "slider.horizontal.3")
                }
                .buttonStyle(PillButtonStyle(kind: .outline, height: 48))
                .accessibilityHint("Choose videos, photos, text posts and articles")
                Text("No engagement bait. These are the only reasons.")
                    .font(Theme.sans(13))
                    .foregroundStyle(Theme.faint)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
    }

    private var postRow: some View {
        HStack(spacing: 12) {
            CoverImage(url: ADHXClient.resolve(post.posterUrl, against: server))
                .frame(width: 40, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(post.article?.title ?? (post.text.isEmpty ? "@\(post.author.handle)" : post.text))
                    .font(Theme.sans(14, .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(postLine)
                    .font(Theme.sans(12))
                    .foregroundStyle(Theme.faint)
            }
            Spacer(minLength: 0)
        }
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.app))
        .accessibilityElement(children: .combine)
    }

    /// "Reddit · 2h".
    private var postLine: String {
        var parts = [Network.name(post.platform)]
        if let when = SaverWords.when(post.savers) { parts.append(when) }
        return parts.joined(separator: " · ")
    }

    /// What we can honestly say about it: the feed's own reason, who saved
    /// it, and that it's new to you.
    private var reasons: [Reason] {
        var out: [Reason] = []
        if let why = post.why {
            out.append(Reason(icon: "sparkles", text: why, savers: post.savers))
        }
        let line = SaverWords.line(post.savers)
        if !line.isEmpty, post.why?.localizedCaseInsensitiveContains(line) != true,
           post.why != line {
            out.append(Reason(icon: "person.2.fill", text: line, savers: out.isEmpty ? post.savers : []))
        }
        if mode == .new {
            out.append(Reason(icon: "eye.slash", text: "You haven’t seen it yet", savers: []))
        }
        if PrivacyStore.shared.isPrivate(post) {
            out.append(Reason(icon: "lock.fill", text: "One of yours, just for you", savers: []))
        }
        if out.isEmpty {
            out.append(Reason(icon: "clock", text: "It’s next, newest first", savers: []))
        }
        return out
    }
}

/// Everyone · Friends only · Mine: whose saves New plays.
struct WhoseSaves: View {
    let mode: FeedMode
    /// The filter sheet labels it in small capitals, on a raised plate.
    var caps = false
    let choose: (FeedMode) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(caps ? "WHOSE SAVES" : "Whose saves")
                .font(Theme.sans(13, caps ? .heavy : .bold))
                .tracking(caps ? 0.8 : 0)
                .foregroundStyle(caps ? Theme.faint : Theme.muted)
            HStack(spacing: 4) {
                option("Everyone", on: mode == .new || mode == .everyone) {
                    choose(mode == .everyone ? .everyone : .new)
                }
                option("Friends only", on: mode == .friends) { choose(.friends) }
                option("Mine", on: mode == .mine) { choose(.mine) }
            }
            .padding(4)
            .background(Capsule().fill(caps ? Theme.raised : Theme.app))
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Whose saves")
        }
    }

    private func option(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(Theme.sans(14, on ? .heavy : .bold))
                .foregroundStyle(on ? .black : Theme.cream)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Capsule().fill(on ? Theme.cream : .clear))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// "What's in your feed": the types New plays (at least one stays on) and
/// whose saves. Changes apply when it closes.
struct FeedFilterSheet: View {
    let types: Set<FeedType>
    let mode: FeedMode
    /// "137 new", the New tab's count.
    var newCount: String?
    /// What the current filter is leaving out.
    var hidden: [FeedType: Int] = [:]
    let setTypes: (Set<FeedType>) -> Void
    let choose: (FeedMode) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var picked: Set<FeedType>

    init(types: Set<FeedType>, mode: FeedMode, newCount: String?, hidden: [FeedType: Int],
         setTypes: @escaping (Set<FeedType>) -> Void, choose: @escaping (FeedMode) -> Void) {
        self.types = types
        self.mode = mode
        self.newCount = newCount
        self.hidden = hidden
        self.setTypes = setTypes
        self.choose = choose
        _picked = State(initialValue: types)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    Text("What’s in your feed")
                        .font(Theme.serif(32))
                        .foregroundStyle(.white)
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 8)
                    if let newCount {
                        Text("\(newCount) new")
                            .font(Theme.sans(13))
                            .foregroundStyle(Theme.faint)
                    }
                }
                VStack(spacing: 0) {
                    ForEach(FeedType.allCases) { type in
                        row(type)
                        if type != FeedType.allCases.last {
                            Divider().overlay(.white.opacity(0.06))
                        }
                    }
                }
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Theme.raised))
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                WhoseSaves(mode: mode, caps: true) { choose($0) }
                if let waiting = waitingLine {
                    Text(waiting)
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.faint)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button(showLabel) { dismiss() }
                    .buttonStyle(PillButtonStyle(kind: .primary))
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .onDisappear { if picked != types { setTypes(picked) } }
    }

    /// "Show videos and photos".
    private var showLabel: String {
        let names = FeedType.allCases.filter(picked.contains).map { title($0).lowercased() }
        return "Show " + SaverWords.names(names, upTo: 4)
    }

    /// "12 text posts and 3 articles are waiting. They'll still be in search and channels."
    private var waitingLine: String? {
        let parts = FeedType.allCases.filter { !picked.contains($0) }.compactMap { type in
            hidden[type].map { type.count($0) }
        }
        if parts.isEmpty {
            return picked.count == 1 ? "One has to stay on, or there’d be nothing to watch." : nil
        }
        let total = FeedType.allCases.filter { !picked.contains($0) }.reduce(0) { $0 + (hidden[$1] ?? 0) }
        return SaverWords.names(parts, upTo: 4) + (total == 1 ? " is" : " are")
            + " waiting. They’ll still be in search and channels."
    }

    private func row(_ type: FeedType) -> some View {
        let on = picked.contains(type)
        let last = on && picked.count == 1
        return Toggle(isOn: Binding(get: { on }, set: { now in
            if now { picked.insert(type) } else if !last { picked.remove(type) }
        })) {
            HStack(spacing: 14) {
                Image(systemName: icon(type))
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(on ? Theme.accent : Theme.muted)
                    .frame(width: 24)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title(type))
                        .font(Theme.sans(16, .heavy))
                        .foregroundStyle(.white)
                    Text(detail(type))
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.faint)
                }
            }
        }
        .toggleStyle(.switch)
        .tint(Theme.accent)
        .disabled(last)
        .padding(.horizontal, 16)
        .frame(minHeight: 64)
        .accessibilityHint(last ? "The last one on stays on" : "")
    }

    private func title(_ type: FeedType) -> String {
        switch type {
        case .video: return "Videos"
        case .photo: return "Photos"
        case .text: return "Text posts"
        case .article: return "Articles"
        }
    }

    private func detail(_ type: FeedType) -> String {
        switch type {
        case .video: return "Reels, clips and tracks with sound"
        case .photo: return "Single shots, albums and memes"
        case .text: return "Threads, tweets and hot takes"
        case .article: return "Long reads, for when you’ve got time"
        }
    }

    private func icon(_ type: FeedType) -> String {
        switch type {
        case .video: return "play.rectangle.fill"
        case .photo: return "photo.fill"
        case .text: return "text.quote"
        case .article: return "doc.richtext"
        }
    }
}

private struct Reason {
    let icon: String
    let text: String
    let savers: [Saver]
}

private struct ReasonRow: View {
    let reason: Reason
    let lead: Bool
    let server: URL

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: reason.icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(lead ? .black : Theme.cream)
                .frame(width: 40, height: 40)
                .background(Circle().fill(lead ? Theme.accent : Theme.raised))
                .accessibilityHidden(true)
            Text(reason.text)
                .font(Theme.sans(16, .bold))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            if !reason.savers.isEmpty {
                FaceStack(savers: reason.savers, server: server, size: 26, ring: Theme.surface)
            }
        }
        .frame(minHeight: 56)
        .accessibilityElement(children: .combine)
    }
}

/// The end of New: "You're all caught up. Go touch grass."
struct CaughtUpView: View {
    let people: [Saver]
    let watched: Int
    let server: URL
    var browseChannels: () -> Void
    var seeLive: () -> Void
    var watchAgain: () -> Void
    /// Room for the bar and tabs above it.
    var topInset: CGFloat = 120
    /// What the filter left out ("4 text posts"), and a way to let it in.
    var hidden: [FeedType: Int] = [:]
    var showHidden: () -> Void = {}

    /// Not a scroll view: it's a page in the player, and a swipe down must go
    /// back to the last post.
    var body: some View {
        VStack(spacing: 0) {
            Spacer().frame(height: topInset)
            VStack(spacing: 0) {
                Gob(size: 88)
                    .shadow(color: Theme.accent.opacity(0.18), radius: 20, y: 18)
                Ellipse()
                    .fill(.black.opacity(0.6))
                    .frame(width: 70, height: 8)
                    .padding(.top, 8)
                    .accessibilityHidden(true)
                VStack(spacing: 0) {
                    Text("You’re all caught up.")
                        .foregroundStyle(.white)
                    Text("Go touch grass.")
                        .foregroundStyle(Theme.accent)
                }
                .font(Theme.serif(42))
                .minimumScaleFactor(0.8)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 18)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
                Text("That’s everything your people saved since you last looked.")
                    .font(Theme.sans(16))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 300)
                    .padding(.top, 14)
                if watched > 0 && !people.isEmpty {
                    summary.padding(.top, 22)
                }
                if let waiting = hiddenLine {
                    Button(action: showHidden) {
                        HStack(spacing: 6) {
                            Text(waiting).foregroundStyle(Theme.cream)
                            Text("· Show them").foregroundStyle(Theme.accent)
                        }
                        .font(Theme.sans(14, .bold))
                        .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 10)
                    .accessibilityLabel("\(waiting). Show them")
                    .accessibilityHint("Adds them to your feed")
                }
                VStack(spacing: 10) {
                    Button("Browse channels", action: browseChannels)
                        .buttonStyle(PillButtonStyle(kind: .primary))
                    HStack(spacing: 10) {
                        Button(action: seeLive) {
                            HStack(spacing: 8) {
                                Circle().fill(Theme.live).frame(width: 8, height: 8).accessibilityHidden(true)
                                Text("See what’s live")
                            }
                        }
                        .buttonStyle(PillButtonStyle(kind: .outline, height: 48))
                        Button("Watch it all again", action: watchAgain)
                        .buttonStyle(PillButtonStyle(kind: .outline, height: 48))
                        .accessibilityHint("Plays everyone’s saves, seen or not")
                    }
                }
                .padding(.top, 22)
            }
            .padding(.horizontal, 20)
            Spacer(minLength: 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            ZStack {
                Theme.app
                RadialGradient(colors: [Theme.accent.opacity(0.12), .clear], center: UnitPoint(x: 0.5, y: 0.35),
                               startRadius: 0, endRadius: 260)
            }
            .ignoresSafeArea()
        )
    }

    /// "4 text posts and 2 articles waiting".
    private var hiddenLine: String? {
        let parts = FeedType.allCases.compactMap { type in hidden[type].map { type.count($0) } }
        guard !parts.isEmpty else { return nil }
        return SaverWords.names(parts, upTo: 4) + " waiting"
    }

    /// "12 from Ana, Ben and Mum".
    private var summary: some View {
        HStack(spacing: 14) {
            FaceStack(savers: people, server: server, size: 26, ring: Theme.surface)
            Text("\(watched) from \(SaverWords.names(people.map(\.displayName)))")
                .font(Theme.sans(14, .bold))
                .foregroundStyle(Theme.cream)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Theme.surface))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(.white.opacity(0.08)))
        .accessibilityElement(children: .combine)
    }
}
