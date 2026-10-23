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
    /// Show more (1) / less (-1) from someone: nil on a server without it.
    var weights: [String: Int]? = nil
    /// The person a change is on its way for.
    var weighing: String? = nil
    var weightError: String? = nil
    var setWeight: (String, Int) -> Void = { _, _ in }
    /// Opens one of your posts (the thumbnail beside "Like … you kept").
    var openPost: ((PostRef) -> Void)? = nil
    @Environment(\.dismiss) private var systemDismiss
    @Environment(\.boardDismiss) private var boardDismiss
    private var dismiss: SheetCloser { SheetCloser(board: boardDismiss, system: systemDismiss) }

    var body: some View {
            VStack(alignment: .leading, spacing: 14) {
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
                        ReasonRow(reason: reason, lead: index == 0, server: server, open: openThumb)
                    }
                }
                WhoseSaves(mode: mode) { picked in
                    choose(picked)
                    dismiss()
                }
                .padding(.top, 4)
                if weights != nil, let more = moreFrom, let less = lessFrom {
                    // The boards' pair: less from one friend, more from another.
                    HStack(spacing: 10) {
                        WeightButton(direction: -1, person: less, friends: friends, weights: weights ?? [:],
                                     busy: weighing != nil, set: setWeight)
                        WeightButton(direction: 1, person: more, friends: friends, weights: weights ?? [:],
                                     busy: weighing != nil, set: setWeight)
                    }
                    if let weightError {
                        Text(weightError)
                            .font(Theme.sans(13))
                            .foregroundStyle(Theme.warn)
                            .frame(maxWidth: .infinity)
                            .multilineTextAlignment(.center)
                    }
                } else {
                    // Nobody else saved it (or an older server): what's in your feed instead.
                    Button {
                        dismiss()
                        // After this sheet has gone, so the next one can come up.
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { filter() }
                    } label: {
                        Label("What’s in your feed", systemImage: "slider.horizontal.3")
                    }
                    .buttonStyle(PillButtonStyle(kind: .raised, height: 48, fontSize: 14))
                    .accessibilityHint("Choose videos, photos, text posts and articles")
                }
                Text("No engagement bait. These are the only reasons.")
                    .font(Theme.sans(13))
                    .foregroundStyle(Theme.inkFaint)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
                    .padding(.top, 2)
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 24)
    }

    /// The thumbnail's post: this sheet closes, then it opens.
    private func openThumb(_ ref: PostRef) {
        guard let openPost else { return }
        dismiss()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { openPost(ref) }
    }

    private var postRow: some View {
        HStack(spacing: 12) {
            CoverImage(url: ADHXClient.resolve(post.posterUrl, against: server))
                .frame(width: 40, height: 56)
                // 16 − 8 inset: follows the row's curve.
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(post.article?.title ?? (post.text.isEmpty ? "@\(post.author.handle)" : post.text))
                    .font(Theme.sans(14, .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(postLine)
                    .font(Theme.sans(12))
                    .foregroundStyle(Theme.inkFaint)
            }
            Spacer(minLength: 0)
        }
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.bg))
        .accessibilityElement(children: .combine)
    }

    /// The friends who saved it (not you), first saver first.
    private var friends: [Saver] {
        var seen = Set<String>()
        return post.savers.filter { !$0.isYou && seen.insert($0.username).inserted }
    }

    /// "Show more from …": whoever you already asked for more of, else the
    /// first friend who saved it.
    private var moreFrom: Saver? {
        friends.first { weights?[$0.username] == 1 } ?? friends.first
    }

    /// "Show less from …": whoever you already asked for less of, else the
    /// second friend (the first, when they're the only one).
    private var lessFrom: Saver? {
        friends.first { weights?[$0.username] == -1 } ?? (friends.count > 1 ? friends[1] : friends.first)
    }

    /// "Reddit · 2h".
    private var postLine: String {
        var parts = [Network.name(post.platform)]
        if let when = SaverWords.when(post.savers) { parts.append(when) }
        return parts.joined(separator: " · ")
    }

    /// What we can honestly say about it: every reason the feed gives (or,
    /// from an older server, its one line and who saved it), and that it's
    /// new to you.
    private var reasons: [Reason] {
        var out: [Reason] = []
        if !post.whyReasons.isEmpty {
            for (index, reason) in post.whyReasons.enumerated() {
                out.append(Reason(icon: Self.icon(for: reason.kind), text: reason.text,
                                  savers: Self.savers(for: reason, lead: index == 0, in: post.savers),
                                  thumb: reason.kind == "like" ? reason.post : nil))
            }
            // These are the only reasons: nothing added on the phone but the lock.
            if PrivacyStore.shared.isPrivate(post) {
                out.append(Reason(icon: "lock.fill", text: "One of yours, just for you", savers: []))
            }
            return out
        }
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

extension WhySheet {
    /// An icon for each kind of reason the blend gives.
    static func icon(for kind: String?) -> String {
        // The web's lucide icons (WHY_ICON): users, plus, bookmark, circle-play, clock.
        switch kind {
        case "together": return "person.2"
        case "more": return "plus"
        case "like", "yours": return "bookmark"
        case "close": return "play.circle"
        case "fresh": return "clock"
        case "sent": return "paperplane"
        default: return "sparkles"
        }
    }

    /// Faces next to a reason: the friend it's about, or (on the headline)
    /// the people who saved it.
    static func savers(for reason: WhyReason, lead: Bool, in savers: [Saver]) -> [Saver] {
        // "Ana and Ben both saved it": everyone who saved it, not just the one named.
        if reason.kind == "together", savers.count > 1 { return savers }
        if let username = reason.username {
            let named = savers.filter { $0.username == username }
            // Whoever sent it to you, even if their save isn't on the post.
            return named.isEmpty && reason.kind == "sent" ? [Saver(username: username)] : named
        }
        return lead || reason.kind == "together" ? savers : []
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
                .font(Theme.sans(13, caps ? .heavy : .semibold))
                .tracking(caps ? 0.78 : 0)
                .foregroundStyle(caps ? Theme.inkFaint : Theme.inkSoft)
            HStack(spacing: 4) {
                option("Everyone", on: mode == .new || mode == .everyone) {
                    choose(mode == .everyone ? .everyone : .new)
                }
                option("Friends only", on: mode == .friends) { choose(.friends) }
                option("Mine", on: mode == .mine) { choose(.mine) }
            }
            .padding(4)
            .background(Capsule(style: .continuous).fill(caps ? Theme.plate : Theme.bg))
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Whose saves")
        }
    }

    private func option(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(Theme.sans(14, on ? .heavy : .semibold))
                .foregroundStyle(on ? Theme.onCream : Theme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: caps ? 40 : 44)
                .background(Capsule(style: .continuous).fill(on ? Theme.cream : .clear))
                .contentShape(Capsule(style: .continuous))
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
    @Environment(\.dismiss) private var systemDismiss
    @Environment(\.boardDismiss) private var boardDismiss
    private var dismiss: SheetCloser { SheetCloser(board: boardDismiss, system: systemDismiss) }
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
                            .foregroundStyle(Theme.inkFaint)
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
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Theme.plate))
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                WhoseSaves(mode: mode, caps: true) { choose($0) }
                if let waiting = waitingLine {
                    Text(waiting)
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.inkFaint)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button(showLabel) { dismiss() }
                    .buttonStyle(PillButtonStyle(kind: .primary))
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 24)
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
                    .font(.system(size: 19, weight: .regular))
                    .foregroundStyle(on ? Theme.accent : Theme.inkSoft)
                    .frame(width: 24)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title(type))
                        .font(Theme.sans(16, .heavy))
                        .foregroundStyle(Theme.ink)
                    Text(detail(type))
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.inkFaint)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                }
            }
        }
        .toggleStyle(BoardSwitchStyle())
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
        case .video: return "video"
        case .photo: return "photo"
        case .text: return "text.alignleft"
        case .article: return "doc.text"
        }
    }
}

/// "− Show less from Ben" / "+ Show more from Ana". Pressed (cream) when
/// that's already your choice for them; tapping it again goes back to normal.
/// With several friends on the post, a long press picks someone else.
private struct WeightButton: View {
    let direction: Int
    let person: Saver
    let friends: [Saver]
    let weights: [String: Int]
    let busy: Bool
    let set: (String, Int) -> Void

    private var on: Bool { weights[person.username] == direction }

    private func title(_ saver: Saver) -> String {
        "Show \(direction > 0 ? "more" : "less") from \(saver.displayName)"
    }

    var body: some View {
        Group {
            if friends.count > 1 {
                Menu {
                    ForEach(friends) { friend in
                        let chosen = weights[friend.username] == direction
                        Button {
                            set(friend.username, chosen ? 0 : direction)
                        } label: {
                            if chosen { Label(title(friend), systemImage: "checkmark") } else { Text(title(friend)) }
                        }
                    }
                } label: {
                    face
                } primaryAction: {
                    set(person.username, on ? 0 : direction)
                }
                .menuStyle(.button)
                .buttonStyle(.plain)
            } else {
                Button {
                    set(person.username, on ? 0 : direction)
                } label: {
                    face
                }
                .buttonStyle(.plain)
            }
        }
        .disabled(busy)
        .accessibilityLabel(title(person))
        .accessibilityValue(on ? "On" : "")
        .accessibilityAddTraits(on ? .isSelected : [])
        .accessibilityHint(friends.count > 1 ? "Touch and hold to choose someone else" : "")
    }

    private var face: some View {
        HStack(spacing: 8) {
            Image(systemName: direction > 0 ? "plus" : "minus")
                .font(.system(size: 14, weight: .bold))
                .accessibilityHidden(true)
            Text(title(person))
                .font(Theme.sans(14, .semibold))
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.85)
        }
        .foregroundStyle(on ? Theme.onCream : Theme.ink)
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, minHeight: 48)
        .background(Capsule(style: .continuous).fill(on ? Theme.cream : Theme.plate))
        .overlay(Capsule(style: .continuous).strokeBorder(.white.opacity(on ? 0 : 0.12)))
        .contentShape(Capsule(style: .continuous))
        .opacity(busy ? 0.6 : 1)
    }
}

private struct Reason {
    let icon: String
    let text: String
    let savers: [Saver]
    /// "Like … you kept": the post of yours it's like.
    var thumb: ReasonPost? = nil
}

private struct ReasonRow: View {
    let reason: Reason
    let lead: Bool
    let server: URL
    var open: (PostRef) -> Void = { _ in }

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: reason.icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(lead ? .black : Theme.ink)
                .frame(width: 40, height: 40)
                .background(Circle().fill(lead ? Theme.accent : Theme.plate))
                .accessibilityHidden(true)
            Text(reason.text)
                .font(Theme.sans(16, .semibold))
                .lineSpacing(2)
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            if let thumb = reason.thumb {
                // 38 pt, Gob shaped, at the reason's right (j2-2). Opens that post.
                Button { open(thumb.ref) } label: {
                    CoverImage(url: ADHXClient.resolve(thumb.posterUrl, against: server))
                        .frame(width: 38, height: 38)
                        .clipShape(GobShape())
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Open the one you kept")
            } else if !reason.savers.isEmpty {
                FaceStack(savers: reason.savers, server: server, size: 28, ring: Theme.surface)
            }
        }
        .frame(minHeight: 56)
        .accessibilityElement(children: reason.thumb == nil ? .combine : .contain)
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
    /// Posters of what you just watched, fanned out on the summary.
    var covers: [URL] = []

    /// Not a scroll view: it's a page in the player, and a swipe down must go
    /// back to the last post.
    var body: some View {
        VStack(spacing: 0) {
            Spacer().frame(height: topInset)
            VStack(spacing: 0) {
                Gob(size: 120)
                    .frame(width: 96, height: 90)
                    .shadow(color: Theme.accent.opacity(0.18), radius: 20, y: 18)
                Ellipse()
                    .fill(.black.opacity(0.6))
                    .frame(width: 70, height: 8)
                    .padding(.top, 10)
                    .accessibilityHidden(true)
                // The boards' line-height 0.95: the two lines nearly touch.
                VStack(spacing: -17) {
                    Text("You’re all caught up.")
                        .foregroundStyle(.white)
                    Text("Go touch grass.")
                        .foregroundStyle(Theme.accent)
                }
                .font(Theme.serif(50))
                .minimumScaleFactor(0.7)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 13)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
                Text("That’s everything your people saved since you last looked.")
                    .font(Theme.sans(16))
                    .lineSpacing(4)
                    .foregroundStyle(Theme.inkSoft)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 300)
                    .padding(.top, 6)
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
                        .buttonStyle(PillButtonStyle(kind: .raised, height: 48))
                        Button(action: watchAgain) {
                            Label("Watch it all again", systemImage: "arrow.counterclockwise")
                                .labelStyle(TightLabel())
                        }
                        .buttonStyle(PillButtonStyle(kind: .outline, height: 48))
                        .accessibilityHint("Plays everyone’s saves, seen or not")
                    }
                }
                .padding(.top, 18)
            }
            .padding(.horizontal, 20)
            Spacer(minLength: 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            ZStack {
                Theme.bg
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

    /// "12 from Ana, Ben and Mum today", with what you watched fanned out.
    private var summary: some View {
        Button(action: watchAgain) {
            HStack(spacing: 14) {
                if !covers.isEmpty {
                    HStack(spacing: -10) {
                        ForEach(Array(covers.prefix(4).enumerated()), id: \.offset) { index, url in
                            CoverImage(url: url)
                                .frame(width: 40, height: 58)
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .strokeBorder(Theme.surface, lineWidth: 2))
                                .rotationEffect(.degrees([-5, -1, 3, 6][index]))
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 6) {
                    FaceStack(savers: people, server: server, size: 22, ring: Theme.surface)
                    Text("\(watched) from \(SaverWords.names(people.map(\.displayName)))")
                        .font(Theme.sans(14, .semibold))
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.inkFaint)
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Theme.surface))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(.white.opacity(0.08)))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Plays everyone’s saves again")
    }
}

/// An icon and words 8 apart, for pill buttons.
struct TightLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) {
            configuration.icon.font(.system(size: 15, weight: .semibold))
            configuration.title
        }
    }
}
