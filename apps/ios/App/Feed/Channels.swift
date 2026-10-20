import SwiftUI

/// Channels (`/api/app/channels`): rabbit holes from everyone's saves, one per
/// friend, and the ones made from what you keep.
@MainActor
final class ChannelsModel: ObservableObject {
    @Published private(set) var index = ChannelsIndex(group: [], friends: [], mine: [])
    @Published private(set) var loadedOnce = false
    @Published private(set) var loadError: String?
    @Published private(set) var unsupported = false
    /// A queue being fetched, so its tile can show a spinner.
    @Published private(set) var opening: String?
    /// A friend's channel open in place of the list (under Home's header).
    @Published var openFriend: FriendSummary?
    /// Whether you may invite people (from `/api/app/people`), for Invite.
    @Published private(set) var canInvite = false

    var onBadKey: () -> Void = {}

    func reload() async {
        guard let client = Store.client() else { return }
        do {
            let index = try await client.channels()
            self.index = index
            loadError = nil
            unsupported = false
            if !index.friends.isEmpty { KnownPeople.replace(with: index.friends.map(\.asSaver)) }
            if let people = try? await client.people() { canInvite = people.canInvite }
        } catch APIError.badKey {
            onBadKey()
        } catch is CancellationError {
            return
        } catch let error as APIError where error.isMissing {
            unsupported = true
        } catch let error as APIError {
            loadError = error.message
        } catch {
            loadError = APIError.offline.message
        }
        loadedOnce = true
    }

    /// A channel's queue to play, or nil (and a message) when it won't come.
    func queue(_ kind: ChannelKind, slug: String) async -> Result<[PhonePost], APIError> {
        guard let client = Store.client() else { return .failure(.offline) }
        opening = "\(kind.rawValue):\(slug)"
        defer { opening = nil }
        do {
            return .success(try await client.channel(kind, slug: slug))
        } catch APIError.badKey {
            onBadKey()
            return .failure(.offline)
        } catch let error as APIError {
            return .failure(error)
        } catch {
            return .failure(.offline)
        }
    }

}

/// A queue to play from the top.
struct PlayQueue: Identifiable {
    let id = UUID()
    let posts: [PhonePost]
    var start: String? = nil
}

struct ChannelsView: View {
    @ObservedObject var model: ChannelsModel
    let server: URL
    /// Your people, everyone (Settings' list).
    @StateObject private var people = SettingsModel()
    @Environment(\.openURL) private var openURL
    @State private var playing: PlayQueue?
    @State private var problem: String?
    @State private var seeAll = false

    var body: some View {
        ScrollView {
            if let friend = model.openFriend {
                FriendChannelBody(friend: friend.asSaver, server: server, size: friend.size,
                                  newCount: friend.newCount)
                    .id(friend.username)
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
                    .padding(.bottom, 40)
                    .accessibilityAction(.escape) { model.openFriend = nil }
            } else {
                list
            }
        }
        .scrollIndicators(.hidden)
        .refreshable { await model.reload() }
        // From the left edge: back to Channels.
        .simultaneousGesture(
            DragGesture(minimumDistance: 24)
                .onEnded { value in
                    guard model.openFriend != nil, value.startLocation.x < 40,
                          value.translation.width > 80, abs(value.translation.height) < 60 else { return }
                    model.openFriend = nil
                }
        )
        .fullScreenCover(item: $playing) { queue in
            PlayerScreen(posts: queue.posts, server: server, start: queue.start ?? queue.posts.first?.key ?? "")
        }
        .navigationDestination(isPresented: $seeAll) {
            PeopleListView(settings: people, server: server, invite: invite)
                .task { await people.load() }
        }
    }

    private var list: some View {
            VStack(alignment: .leading, spacing: 24) {
                if !model.loadedOnce {
                    HStack { Spacer(); RingSpinner(size: 34, lineWidth: 3); Spacer() }
                        .padding(.top, 60)
                } else if model.unsupported {
                    EmptyNote(title: "No channels here yet",
                              message: "Your ADHX needs an update before it can sort saves into channels.")
                } else if let error = model.loadError, model.index.isEmpty {
                    EmptyNote(title: "Can’t load channels", message: error) {
                        Task { await model.reload() }
                    }
                } else if model.index.isEmpty {
                    EmptyNote(title: "Nothing to sort yet",
                              message: "Save a few things and they’ll find their own rabbit holes.")
                } else {
                    if let problem {
                        Text(problem)
                            .font(Theme.sans(14))
                            .foregroundStyle(Theme.warn)
                            .padding(.horizontal, 16)
                    }
                    if !model.index.group.isEmpty { fromEveryone }
                    if !model.index.friends.isEmpty { yourPeople }
                    if !model.index.mine.isEmpty { madeForYou }
                }
            }
            .padding(.top, 8)
            .padding(.bottom, 40)
    }

    /// No phone route makes invites yet: Settings → Your people on the web does.
    private func invite() {
        if let url = ADHXClient.resolve("/settings#people", against: server) { openURL(url) }
    }

    // MARK: Rows

    private var fromEveryone: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(title: "From everyone", detail: "Rabbit holes, dug by your friends")
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 12) {
                    ForEach(model.index.group) { channel in
                        Button { play(.group, channel.slug) } label: {
                            GroupTile(channel: channel, server: server,
                                      opening: model.opening == "group:\(channel.slug)")
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
            .scrollIndicators(.hidden)
        }
    }

    private var yourPeople: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                SectionTitle(title: "Your people", detail: nil, size: 28)
                Spacer(minLength: 8)
                Button("See all") { seeAll = true }
                    .font(Theme.sans(14, .semibold))
                    .foregroundStyle(Theme.accent)
                    .padding(.vertical, 12)
                    .padding(.horizontal, 8)
                    .contentShape(Rectangle())
                    .padding(.vertical, -12)
                    .padding(.trailing, 8)
                    .accessibilityHint("Everyone on your ADHX")
            }
            // Spread across the row while they fit (the boards'), else a scroll.
            let count = model.index.friends.count + (model.canInvite ? 1 : 0)
            if count <= 5 {
                HStack(alignment: .top, spacing: 0) {
                    ForEach(Array(model.index.friends.enumerated()), id: \.element.id) { index, person in
                        if index > 0 { Spacer(minLength: 4) }
                        personButton(person)
                    }
                    if model.canInvite {
                        Spacer(minLength: 4)
                        InviteButton(action: invite)
                    }
                    if count < 5 { Spacer(minLength: 0) }
                }
                .padding(.horizontal, 16)
            } else {
                ScrollView(.horizontal) {
                    LazyHStack(alignment: .top, spacing: 14) {
                        ForEach(model.index.friends) { personButton($0) }
                        if model.canInvite { InviteButton(action: invite) }
                    }
                    .padding(.horizontal, 16)
                }
                .scrollIndicators(.hidden)
            }
        }
    }

    private func personButton(_ person: FriendSummary) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) { model.openFriend = person }
        } label: {
            PersonButton(person: person, server: server)
        }
        .buttonStyle(.plain)
    }

    private var madeForYou: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(title: "Made for you", detail: "Built from what you keep. No ad tech consulted.", size: 28)
            VStack(spacing: 8) {
                ForEach(model.index.mine) { channel in
                    Button { play(.mine, channel.slug) } label: {
                        MineRow(channel: channel, server: server, opening: model.opening == "mine:\(channel.slug)")
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func play(_ kind: ChannelKind, _ slug: String) {
        guard model.opening == nil else { return }
        problem = nil
        Task {
            switch await model.queue(kind, slug: slug) {
            case .success(let posts) where !posts.isEmpty:
                playing = PlayQueue(posts: posts)
            case .success:
                problem = "Nothing in that one right now."
            case .failure(let error):
                problem = error.isMissing ? "That channel isn’t there any more." : error.message
            }
        }
    }
}

// MARK: - Pieces

struct SectionTitle: View {
    let title: String
    let detail: String?
    var size: CGFloat = 32

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(Theme.serif(size))
                .foregroundStyle(.white)
                .accessibilityAddTraits(.isHeader)
            if let detail {
                Text(detail)
                    .font(Theme.sans(14))
                    .foregroundStyle(Theme.faint)
            }
        }
        .padding(.horizontal, 16)
    }
}

/// A headline and a line for empty or broken screens, with an optional retry.
struct EmptyNote: View {
    let title: String
    let message: String
    var retry: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Gob(size: 44)
            Text(title)
                .font(Theme.serif(34))
                .foregroundStyle(.white)
                .accessibilityAddTraits(.isHeader)
            Text(message)
                .font(Theme.sans(15))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
            if let retry {
                Button("Try again", action: retry)
                    .buttonStyle(PillButtonStyle(kind: .outline, height: 44, fullWidth: false))
                    .padding(.top, 6)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 40)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// One picture that fills its box.
struct CoverImage: View {
    let url: URL?

    var body: some View {
        Theme.placeholder
            .overlay {
                if let url {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image { image.resizable().scaledToFill() } else { Theme.placeholder }
                    }
                }
            }
            .clipped()
            .accessibilityHidden(true)
    }
}

/// Up to four covers in a square: 2×2, a big one and two, a split, or one.
struct Mosaic: View {
    let covers: [String]
    let server: URL

    var body: some View {
        let urls = covers.prefix(4).map { ADHXClient.resolve($0, against: server) }
        Group {
            switch urls.count {
            case 0:
                Theme.placeholder.overlay(Gob(size: 36).opacity(0.6))
            case 1:
                CoverImage(url: urls[0])
            case 2:
                HStack(spacing: 2) { CoverImage(url: urls[0]); CoverImage(url: urls[1]) }
            case 3:
                HStack(spacing: 2) {
                    CoverImage(url: urls[0])
                    VStack(spacing: 2) { CoverImage(url: urls[1]); CoverImage(url: urls[2]) }
                }
            default:
                VStack(spacing: 2) {
                    HStack(spacing: 2) { CoverImage(url: urls[0]); CoverImage(url: urls[1]) }
                    HStack(spacing: 2) { CoverImage(url: urls[2]); CoverImage(url: urls[3]) }
                }
            }
        }
        .background(Theme.app)
        .accessibilityHidden(true)
    }
}

private struct GroupTile: View {
    let channel: ChannelSummary
    let server: URL
    let opening: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Mosaic(covers: channel.covers, server: server)
                .frame(width: 160, height: 160)
                .overlay(alignment: .topLeading) {
                    if let new = channel.newCount, new > 0 {
                        Text("\(new) new")
                            .font(Theme.sans(11, .heavy))
                            .foregroundStyle(.black)
                            .padding(.horizontal, 9)
                            .frame(height: 24)
                            .background(Capsule().fill(Theme.accent))
                            .padding(8)
                    }
                }
                .overlay { if opening { Color.black.opacity(0.4); RingSpinner(size: 28, lineWidth: 3) } }
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            Text(channel.name)
                .font(Theme.sans(15, .heavy))
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
            HStack(spacing: 7) {
                if !channel.savers.isEmpty {
                    FaceStack(savers: channel.savers, server: server, size: 20, ring: Theme.app)
                }
                Text(detail)
                    .font(Theme.sans(12))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .frame(width: 160, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(channel.name), \(detail)")
        .accessibilityHint("Plays this channel")
        .accessibilityAddTraits(.isButton)
    }

    /// "38 saves · 3 of you", "41 saves · Mum and you".
    private var detail: String {
        var parts: [String] = []
        if let size = channel.size { parts.append(size == 1 ? "1 save" : "\(size) saves") }
        let people = channel.savers
        if people.count > 2 {
            parts.append("\(people.count) of you")
        } else if !people.isEmpty {
            parts.append(SaverWords.who(people))
        }
        return parts.joined(separator: " · ")
    }
}

private struct PersonButton: View {
    let person: FriendSummary
    let server: URL

    var body: some View {
        VStack(spacing: 6) {
            // The boards' double ring: a gap the colour of the page, then
            // yellow when there's something new (a plate otherwise).
            Face(saver: person.asSaver, server: server, size: 60, ring: .clear)
                .padding(2)
                .background(GobShape().fill(Theme.app))
                .padding(2)
                .background(GobShape().fill(person.newCount > 0 ? Theme.accent : Theme.plate))
                .overlay(alignment: .topTrailing) {
                    if person.newCount > 0 {
                        Text(person.newCount > 99 ? "99+" : "\(person.newCount)")
                            .font(Theme.sans(12, .heavy))
                            .foregroundStyle(.black)
                            .padding(.horizontal, 5)
                            .frame(minWidth: 22, minHeight: 22)
                            .background(Capsule().fill(Theme.accent))
                            .padding(2)
                            .background(Capsule().fill(Theme.app))
                            .fixedSize()
                            .offset(x: 0, y: -2)
                    }
                }
            Text(person.displayName)
                .font(Theme.sans(13, .semibold))
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
        }
        .frame(width: 68)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(person.displayName)’s saves" + (person.newCount > 0 ? ", \(person.newCount) new" : ""))
        .accessibilityAddTraits(.isButton)
    }
}

/// "+ Invite" at the end of Your people (opens your ADHX in the browser).
private struct InviteButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: "plus")
                    .font(.system(size: 20, weight: .medium))
                    .frame(width: 60, height: 60)
                    .overlay(Circle().strokeBorder(Theme.accent.opacity(0.6),
                                                   style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])))
                    .padding(4)
                Text("Invite")
                    .font(Theme.sans(13, .semibold))
            }
            .foregroundStyle(Theme.accent)
            .frame(width: 68)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Invite someone")
        .accessibilityHint("Makes a link on your ADHX, in the browser")
    }
}

private struct MineRow: View {
    let channel: ChannelSummary
    let server: URL
    let opening: Bool

    var body: some View {
        HStack(spacing: 12) {
            CoverImage(url: ADHXClient.resolve(channel.covers.first, against: server))
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(channel.name)
                    .font(Theme.sans(15, .heavy))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Text(detail)
                    .font(Theme.sans(13))
                    .foregroundStyle(Theme.faint)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            Group {
                if opening {
                    RingSpinner(size: 22, lineWidth: 2)
                } else {
                    Image(systemName: "play.fill")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.ink)
                }
            }
            .frame(width: 44, height: 44)
            .background(Circle().fill(Theme.plate))
        }
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Theme.surface))
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(channel.name), \(detail)")
        .accessibilityHint("Plays this channel")
        .accessibilityAddTraits(.isButton)
    }

    private var detail: String {
        if let note = channel.note, !note.isEmpty { return note }
        guard let size = channel.size else { return "From what you keep" }
        return (size == 1 ? "1 save" : "\(size) saves") + " · from what you keep"
    }
}

// MARK: - A friend's channel

/// One thing in a friend's channel grid: a post, or their note card.
private enum FriendTile: Identifiable {
    case post(PhonePost)
    case note(FriendNote)

    var id: String {
        switch self {
        case .post(let post): return post.key
        case .note(let note): return "note:\(note.key)"
        }
    }

    /// Height for width, to even out the two columns.
    var shape: CGFloat {
        switch self {
        case .note: return 0.8
        case .post(let post):
            var aspect: CGFloat = 0.75
            if let media = post.media.first, let w = media.width, let h = media.height, w > 0, h > 0 {
                aspect = min(max(CGFloat(w) / CGFloat(h), 0.6), 1)
            }
            return 1 / aspect
        }
    }
}

/// "Ana's saves": everything one of your people shared, as a grid, with Play
/// all, Play the N new (what you haven't saved or seen) and their latest note.
/// Inline under Home's header (from Channels) or on its own (`FriendChannelScreen`).
struct FriendChannelBody: View {
    let friend: Saver
    let server: URL
    var size: Int?
    var newCount: Int?
    @State private var queue: ChannelQueue?
    @State private var error: String?
    @State private var playing: PlayQueue?

    private var posts: [PhonePost] { queue?.items ?? [] }
    /// The server's marks, once they've come; the channel list's count before.
    private var unseen: Int { queue.map { $0.fresh.count } ?? (newCount ?? 0) }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            content
        }
        .task(id: friend.username) { await load() }
        .fullScreenCover(item: $playing) { queue in
            PlayerScreen(posts: queue.posts, server: server, start: queue.start ?? queue.posts.first?.key ?? "")
        }
    }

    private var title: String {
        friend.isYou ? "Your saves" : "\(friend.displayName)’s saves"
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                Face(saver: friend, server: server, size: 64, ring: .clear)
                    .padding(3)
                    .background(GobShape().fill(Theme.app))
                    .padding(2)
                    .background(GobShape().fill(Face.colour(for: friend.username).opacity(0.35)))
                VStack(alignment: .leading, spacing: 6) {
                    Text(title)
                        .font(Theme.serif(40))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                        .accessibilityAddTraits(.isHeader)
                    countLine
                }
            }
            if !posts.isEmpty {
                HStack(spacing: 8) {
                    Button {
                        playing = PlayQueue(posts: posts)
                    } label: {
                        Label("Play all", systemImage: "play.fill")
                            .labelStyle(TightLabel())
                    }
                    .buttonStyle(PillButtonStyle(kind: .primary, height: 48, fullWidth: false, fontSize: 15))
                    if let fresh = queue?.fresh, !fresh.isEmpty {
                        Button {
                            playing = PlayQueue(posts: fresh)
                        } label: {
                            HStack(spacing: 8) {
                                Circle().fill(Theme.accent).frame(width: 7, height: 7).accessibilityHidden(true)
                                Text(fresh.count == 1 ? "Play the new one" : "Play the \(fresh.count) new")
                            }
                        }
                        .buttonStyle(PillButtonStyle(kind: .raised, height: 48, fullWidth: false, fontSize: 15))
                        .accessibilityHint("Plays the ones you haven’t seen")
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var countLine: some View {
        let count = size ?? (queue != nil ? posts.count : nil)
        if count != nil || unseen > 0 {
            HStack(spacing: 0) {
                if let count { Text(count == 1 ? "1 save" : "\(count) saves").foregroundStyle(Theme.muted) }
                if unseen > 0 {
                    Text(count == nil ? "" : " · ").foregroundStyle(Theme.muted)
                    Text("\(unseen) you haven’t seen").foregroundStyle(Theme.accent)
                }
            }
            .font(Theme.sans(13, .semibold))
            .accessibilityElement(children: .combine)
        }
    }

    @ViewBuilder
    private var content: some View {
        if queue == nil && error == nil {
            HStack { Spacer(); RingSpinner(size: 30, lineWidth: 3); Spacer() }.padding(.top, 30)
        } else if let error, queue == nil {
            Text(error).font(Theme.sans(15)).foregroundStyle(Theme.muted)
            Button("Try again") { Task { await load() } }
                .buttonStyle(PillButtonStyle(kind: .outline, height: 44, fullWidth: false))
        } else if posts.isEmpty {
            Text(friend.isYou ? "Nothing shared yet." : "Nothing from \(friend.displayName) yet. Give them a nudge.")
                .font(Theme.sans(15))
                .foregroundStyle(Theme.muted)
        } else {
            // Two columns of posters in their own shapes, each to the column
            // that's shorter so far (the boards' masonry); the note sits third.
            let columns = Self.columns(tiles)
            HStack(alignment: .top, spacing: 10) {
                ForEach(0..<2, id: \.self) { column in
                    LazyVStack(spacing: 10) {
                        ForEach(columns[column]) { tile in
                            switch tile {
                            case .post(let post):
                                Button {
                                    playing = PlayQueue(posts: posts, start: post.key)
                                } label: {
                                    PostTile(post: post, server: server, hiddenSaver: friend.username)
                                }
                                .buttonStyle(.plain)
                            case .note(let note):
                                Button {
                                    let start = posts.contains { $0.key == note.key } ? note.key : posts.first?.key
                                    playing = PlayQueue(posts: posts, start: start)
                                } label: {
                                    NoteCard(note: note, friend: friend, server: server,
                                             post: posts.first { $0.key == note.key })
                                }
                                .buttonStyle(.plain)
                                .accessibilityHint("Plays that post")
                            }
                        }
                    }
                }
            }
        }
    }

    /// The posts, with the note card after the first two.
    private var tiles: [FriendTile] {
        var out = posts.map(FriendTile.post)
        if let note = queue?.note, !friend.isYou {
            out.insert(.note(note), at: min(2, out.count))
        }
        return out
    }

    /// Tiles split into two columns, each to the one that's shorter so far.
    private static func columns(_ tiles: [FriendTile]) -> [[FriendTile]] {
        var out: [[FriendTile]] = [[], []]
        var heights: [CGFloat] = [0, 0]
        for tile in tiles {
            let column = heights[0] <= heights[1] ? 0 : 1
            out[column].append(tile)
            heights[column] += tile.shape + 0.06
        }
        return out
    }

    private func load() async {
        guard let client = Store.client() else { return }
        do {
            queue = try await client.channelQueue(.friend, slug: friend.username)
            error = nil
        } catch let failure as APIError {
            error = failure.isMissing ? "Your ADHX needs an update before it can show this." : failure.message
        } catch is CancellationError {
            return
        } catch {
            self.error = APIError.offline.message
        }
    }
}

/// A friend's note, on paper: their face, "Ana's note", the words in the
/// serif, and what it's on.
private struct NoteCard: View {
    let note: FriendNote
    let friend: Saver
    let server: URL
    let post: PhonePost?

    private static let paper = Color(hex: 0xE4DAC8)
    private static let ink = Color(hex: 0x141414)

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Face(saver: friend, server: server, size: 22, ring: .clear)
                Text("\(friend.displayName)’s note")
                    .font(Theme.sans(12, .heavy))
            }
            Text("“\(note.text)”")
                .font(Theme.serif(26))
                .lineSpacing(-2)
                .fixedSize(horizontal: false, vertical: true)
            if let detail {
                Text(detail)
                    .font(Theme.sans(12))
                    .foregroundStyle(Color(hex: 0x3A352D))
                    .lineLimit(2)
            }
        }
        .foregroundStyle(Self.ink)
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Self.paper))
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    /// "on Charlie bit my finger · 3 days ago".
    private var detail: String? {
        var parts: [String] = []
        if let post {
            let words = (post.article?.title ?? post.text)
                .split(separator: "\n", omittingEmptySubsequences: true).first.map(String.init) ?? ""
            if !words.isEmpty { parts.append("on \(words)") }
        }
        if note.savedAt != nil {
            // "Saved 3 days ago" → "3 days ago".
            let saved = Format.savedAgo(note.savedAt)
            parts.append(saved.hasPrefix("Saved ") ? String(saved.dropFirst(6)) : saved)
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// A friend's channel on its own screen (from a face, or Your people), with a
/// close button.
struct FriendChannelScreen: View {
    let friend: Saver
    let server: URL
    var size: Int?
    var newCount: Int?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(Theme.surface))
                    }
                    .accessibilityLabel("Close")
                    Spacer()
                }
                FriendChannelBody(friend: friend, server: server, size: size, newCount: newCount)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .scrollIndicators(.hidden)
        .background(Theme.app.ignoresSafeArea())
    }
}
