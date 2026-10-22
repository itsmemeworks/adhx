import SwiftUI

/// Reactions (`GET /api/app/reacted`): every post you can see that has
/// reactions, newest reaction first. A row at the top of Channels; tapping
/// plays them, and the player floats each post's reactions as it lands.
@MainActor
final class ReactedModel: ObservableObject {
    @Published private(set) var items: [ReactedPost] = []
    @Published private(set) var nextOffset: Int?
    /// The server's count of every post with reactions, when it says.
    @Published private(set) var total: Int?
    @Published private(set) var loadedOnce = false
    /// This ADHX has no reactions feed yet: the row just doesn't show.
    @Published private(set) var unsupported = false
    private var loadingMore = false

    static let pageSize = 30

    var posts: [PhonePost] { items.map(\.post) }

    func reload() async {
        guard let client = Store.client() else { return }
        do {
            let page = try await client.reacted(offset: 0, limit: Self.pageSize)
            items = Self.unique(page.items)
            nextOffset = page.nextOffset
            total = page.total
            unsupported = false
        } catch let error as APIError where error.isMissing {
            unsupported = true
            items = []
        } catch {
            // Keep what's showing; Channels says nothing about a missing extra row.
        }
        loadedOnce = true
    }

    /// The next page, when the player is near the end.
    func loadMoreIfNeeded(at index: Int) {
        guard index >= items.count - 4, !loadingMore, let offset = nextOffset,
              let client = Store.client() else { return }
        loadingMore = true
        Task { [weak self] in
            defer { self?.loadingMore = false }
            guard let page = try? await client.reacted(offset: offset, limit: Self.pageSize), let self else { return }
            self.items = Self.unique(self.items + page.items)
            self.nextOffset = page.nextOffset
        }
    }

    /// "12 posts with reactions".
    var countLine: String {
        if let total { return ReactedPage.countLine(total, more: false) }
        return ReactedPage.countLine(items.count, more: nextOffset != nil)
    }

    /// "Reactions · 1 of 12" (board 11.4): where you are in the queue.
    func position(_ index: Int) -> String {
        let of = total.map(String.init) ?? (nextOffset != nil ? "\(items.count)+" : "\(items.count)")
        return "Reactions · \(index + 1) of \(of)"
    }

    private static func unique(_ list: [ReactedPost]) -> [ReactedPost] {
        var seen = Set<String>()
        return list.filter { seen.insert($0.id).inserted }
    }
}

/// "Reactions · 12 posts with reactions", then posters with the last
/// reaction's face and emoji. `play(nil)` is Play all.
struct ReactionsRow: View {
    @ObservedObject var model: ReactedModel
    let server: URL
    let play: (PhonePost?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                SectionTitle(title: "Reactions", detail: model.countLine)
                Spacer(minLength: 8)
                Button { play(nil) } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "play.fill").font(.system(size: 11, weight: .bold))
                        Text("Play all")
                    }
                }
                .font(Theme.sans(14, .semibold))
                .foregroundStyle(Theme.accent)
                .padding(.vertical, 12)
                .padding(.horizontal, 8)
                .contentShape(Rectangle())
                .padding(.vertical, -12)
                .padding(.trailing, 8)
                .accessibilityLabel("Play all posts with reactions")
            }
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 10) {
                    ForEach(model.items.prefix(20)) { item in
                        Button { play(item.post) } label: {
                            ReactedTile(item: item, server: server)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
            .scrollIndicators(.hidden)
        }
    }
}

private struct ReactedTile: View {
    let item: ReactedPost
    let server: URL

    var body: some View {
        CoverImage(url: ADHXClient.resolve(item.post.posterUrl, against: server))
            .frame(width: 112, height: 168)
            .overlay {
                if item.post.posterUrl == nil {
                    Text(item.post.text)
                        .font(Theme.sans(12, .semibold))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(6)
                        .padding(10)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
            }
            .overlay(alignment: .bottom) {
                LinearGradient(colors: [.clear, .black.opacity(0.7)], startPoint: .top, endPoint: .bottom)
                    .frame(height: 70)
                    .allowsHitTesting(false)
            }
            .overlay(alignment: .bottomLeading) { lastReaction.padding(8) }
            .overlay(alignment: .topTrailing) {
                if item.reactions.count > 1 {
                    Text("\(item.reactions.count)")
                        .font(Theme.sans(11, .heavy))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7)
                        .frame(minWidth: 22, minHeight: 22)
                        .frosted(Capsule(style: .continuous), dim: 0.45)
                        .padding(6)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityHint("Plays the posts with reactions from here")
            .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder
    private var lastReaction: some View {
        if let last = item.reactions.last {
            HStack(spacing: 6) {
                Face(saver: last.saver, server: server, size: 30, ring: .black)
                    .overlay(alignment: .bottomTrailing) {
                        if let emoji = last.emoji {
                            Text(emoji)
                                .font(.system(size: 17))
                                .offset(x: 8, y: 6)
                        }
                    }
                if last.emoji == nil, let text = last.text {
                    Text(text)
                        .font(Theme.sans(11, .bold))
                        .foregroundStyle(.black)
                        .lineLimit(1)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 4)
                        .background(Capsule(style: .continuous).fill(Face.colour(for: last.saver.username)))
                        .frame(maxWidth: 64, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    /// "Ana: 😂, 3 reactions".
    private var label: String {
        var parts: [String] = []
        if let last = item.reactions.last {
            parts.append("\(last.saver.displayName): \(last.text ?? last.emoji ?? "")")
        }
        let count = item.reactions.count
        if count > 1 { parts.append("\(count) reactions") }
        if !item.post.text.isEmpty { parts.append(String(item.post.text.prefix(60))) }
        return parts.joined(separator: ", ")
    }
}

/// The reactions queue in the player, paging in more as you go.
struct ReactedPlayer: View {
    @ObservedObject var model: ReactedModel
    let server: URL
    let start: String

    var body: some View {
        PlayerScreen(posts: model.posts, server: server, start: start,
                     onShow: { index in model.loadMoreIfNeeded(at: index) }, replayReactions: true,
                     position: { model.position($0) })
    }
}
