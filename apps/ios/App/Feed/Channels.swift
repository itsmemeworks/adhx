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

    var onBadKey: () -> Void = {}

    func reload() async {
        guard let client = Store.client() else { return }
        do {
            let index = try await client.channels()
            self.index = index
            loadError = nil
            unsupported = false
            if !index.friends.isEmpty { KnownPeople.replace(with: index.friends.map(\.asSaver)) }
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
    @State private var playing: PlayQueue?
    @State private var friend: FriendSummary?
    @State private var problem: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
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
            .padding(.top, 12)
            .padding(.bottom, 40)
        }
        .scrollIndicators(.hidden)
        .refreshable { await model.reload() }
        .fullScreenCover(item: $playing) { queue in
            PlayerScreen(posts: queue.posts, server: server, start: queue.start ?? queue.posts.first?.key ?? "")
        }
        .fullScreenCover(item: $friend) { friend in
            FriendChannelScreen(friend: friend.asSaver, server: server, size: friend.size,
                                newCount: friend.newCount)
        }
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
            SectionTitle(title: "Your people", detail: nil)
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 16) {
                    ForEach(model.index.friends) { person in
                        Button { friend = person } label: {
                            PersonButton(person: person, server: server)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
            .scrollIndicators(.hidden)
        }
    }

    private var madeForYou: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(title: "Made for you", detail: "Built from what you keep. No ad tech consulted.")
            VStack(spacing: 10) {
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

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(Theme.serif(32))
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
                .foregroundStyle(Theme.cream)
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
        VStack(spacing: 8) {
            Face(saver: person.asSaver, server: server, size: 64, ring: Theme.app)
                .overlay(alignment: .topTrailing) {
                    if person.newCount > 0 {
                        Text(person.newCount > 99 ? "99+" : "\(person.newCount)")
                            .font(Theme.sans(12, .heavy))
                            .foregroundStyle(.black)
                            .padding(.horizontal, 6)
                            .frame(minWidth: 24, minHeight: 24)
                            .background(Capsule().fill(Theme.accent))
                            .overlay(Capsule().strokeBorder(Theme.app, lineWidth: 2))
                            .offset(x: 4, y: -2)
                    }
                }
            Text(person.displayName)
                .font(Theme.sans(13, .bold))
                .foregroundStyle(Theme.cream)
                .lineLimit(1)
        }
        .frame(width: 72)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(person.displayName)’s saves" + (person.newCount > 0 ? ", \(person.newCount) new" : ""))
        .accessibilityAddTraits(.isButton)
    }
}

private struct MineRow: View {
    let channel: ChannelSummary
    let server: URL
    let opening: Bool

    var body: some View {
        HStack(spacing: 14) {
            CoverImage(url: ADHXClient.resolve(channel.covers.first, against: server))
                .frame(width: 96, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(channel.name)
                    .font(Theme.sans(16, .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(detail)
                    .font(Theme.sans(13))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            if opening {
                RingSpinner(size: 22, lineWidth: 2)
            } else {
                Image(systemName: "play.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(.black)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Theme.accent))
            }
        }
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.surface))
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(channel.name), \(detail)")
        .accessibilityHint("Plays this channel")
        .accessibilityAddTraits(.isButton)
    }

    private var detail: String {
        if let note = channel.note, !note.isEmpty { return note }
        guard let size = channel.size else { return "From what you keep" }
        return size == 1 ? "1 save" : "\(size) saves"
    }
}

// MARK: - A friend's channel

/// "Ana's saves": everything one of your people shared, as a grid, with Play all.
struct FriendChannelScreen: View {
    let friend: Saver
    let server: URL
    var size: Int?
    var newCount: Int?
    @Environment(\.dismiss) private var dismiss
    @State private var posts: [PhonePost] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var playing: PlayQueue?

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
                header
                content
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .scrollIndicators(.hidden)
        .background(Theme.app.ignoresSafeArea())
        .task { await load() }
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
                Face(saver: friend, server: server, size: 64, ring: Theme.app)
                    .padding(3)
                    .overlay(GobShape().strokeBorder(Face.colour(for: friend.username).opacity(0.4), lineWidth: 2))
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
                Button {
                    playing = PlayQueue(posts: posts)
                } label: {
                    Label("Play all", systemImage: "play.fill")
                }
                .buttonStyle(PillButtonStyle(kind: .primary, height: 48, fullWidth: false))
            }
        }
    }

    @ViewBuilder
    private var countLine: some View {
        let count = size ?? (loaded ? posts.count : nil)
        if count != nil || (newCount ?? 0) > 0 {
            HStack(spacing: 0) {
                if let count { Text(count == 1 ? "1 save" : "\(count) saves").foregroundStyle(Theme.muted) }
                if let newCount, newCount > 0 {
                    Text(count == nil ? "" : " · ").foregroundStyle(Theme.muted)
                    Text("\(newCount) you haven’t seen").foregroundStyle(Theme.accent)
                }
            }
            .font(Theme.sans(13, .bold))
            .accessibilityElement(children: .combine)
        }
    }

    @ViewBuilder
    private var content: some View {
        if !loaded {
            HStack { Spacer(); RingSpinner(size: 30, lineWidth: 3); Spacer() }.padding(.top, 30)
        } else if let error {
            Text(error).font(Theme.sans(15)).foregroundStyle(Theme.muted)
            Button("Try again") { Task { await load() } }
                .buttonStyle(PillButtonStyle(kind: .outline, height: 44, fullWidth: false))
        } else if posts.isEmpty {
            Text(friend.isYou ? "Nothing shared yet." : "Nothing from \(friend.displayName) yet. Give them a nudge.")
                .font(Theme.sans(15))
                .foregroundStyle(Theme.muted)
        } else {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
                      spacing: 10) {
                ForEach(posts, id: \.key) { post in
                    Button {
                        playing = PlayQueue(posts: posts, start: post.key)
                    } label: {
                        PostTile(post: post, server: server, hiddenSaver: friend.username)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func load() async {
        guard let client = Store.client() else { return }
        do {
            posts = try await client.channel(.friend, slug: friend.username)
            error = nil
        } catch let failure as APIError {
            error = failure.isMissing ? "Your ADHX needs an update before it can show this." : failure.message
        } catch is CancellationError {
            return
        } catch {
            self.error = APIError.offline.message
        }
        loaded = true
    }
}
