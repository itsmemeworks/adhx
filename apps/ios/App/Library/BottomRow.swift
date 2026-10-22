import SwiftUI

/// The player's bottom row (board 15.7): the first saver's face, the line
/// you drag through, and where you are ("5 of 51", opening Up next). Tapping
/// the face turns the row into who's on the post (15.9): ✕ and everyone's
/// faces with a sticker in a fixed corner for saved, their reaction, watched.

/// "5 of 51", and what tapping it does.
struct QueueCount {
    let text: String
    /// What VoiceOver says before "Open Up next" ("Just saved, 1 of 2").
    var label: String?
    let open: () -> Void
}

/// The first saver's face, "+1" when more people saved it.
struct FirstSaverButton: View {
    let savers: [Saver]
    let server: URL
    let open: () -> Void

    var body: some View {
        if let first = FirstSaver.of(savers) {
            let more = savers.count - 1
            Button(action: open) {
                Face(saver: first, server: server, size: 34, ring: .black)
                    .overlay(alignment: .bottomTrailing) {
                        if more > 0 {
                            Text("+\(more)")
                                .font(Theme.sans(10, .heavy))
                                .foregroundStyle(.black)
                                .padding(.horizontal, 4)
                                .frame(minWidth: 18, minHeight: 18)
                                .background(Capsule(style: .continuous).fill(Theme.cream))
                                .overlay(Capsule(style: .continuous).strokeBorder(.black, lineWidth: 2))
                                .offset(x: 6, y: 4)
                        }
                    }
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(more > 0 ? "Who’s on this one: \(first.displayName) and \(more) more"
                                    : "Who’s on this one: \(first.displayName)")
        }
    }
}

/// "5 of 51" with the list mark: opens Up next.
struct CountPill: View {
    let count: QueueCount

    var body: some View {
        Button(action: count.open) {
            HStack(spacing: 6) {
                Image(systemName: "list.bullet")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.accent)
                Text(count.text)
                    .font(Theme.sans(13, .heavy))
                    .foregroundStyle(Theme.ink)
                    .fixedSize()
            }
            .padding(.horizontal, 10)
            .frame(height: 36)
            .frosted(Capsule(style: .continuous), dim: 0.55)
            .overlay(Capsule(style: .continuous).strokeBorder(.white.opacity(0.14), lineWidth: 1))
            .contentShape(Capsule(style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(count.label ?? count.text). Open Up next")
    }
}

/// ✕ and everyone's faces, scrolling sideways.
struct WhoRow: View {
    let post: PhonePost
    let server: URL
    let close: () -> Void
    var openFriend: (Saver) -> Void = { _ in }
    @StateObject private var model = PostPeopleModel()

    var body: some View {
        HStack(spacing: 14) {
            Button(action: close) {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Theme.ink)
                    .frame(width: 44, height: 44)
                    .frosted(Circle(), dim: 0.5)
                    .overlay(Circle().strokeBorder(.white.opacity(0.14), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close who’s on this one")
            Rectangle().fill(.white.opacity(0.2)).frame(width: 1, height: 28)
                .accessibilityHidden(true)
            ScrollView(.horizontal) {
                HStack(spacing: 22) {
                    ForEach(model.everyone) { person in
                        Button { if !person.saver.isYou { openFriend(person.saver) } } label: {
                            StickeredFace(person: person, server: server)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(person.label)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 10)
            }
            .scrollIndicators(.hidden)
            .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.88),
                                         .init(color: .clear, location: 1)],
                                 startPoint: .leading, endPoint: .trailing))
        }
        .task(id: post.key) { await model.load(post) }
    }
}

/// A face with its stickers, each in its own corner: saved bottom-right, a
/// reaction top-right, watched bottom-left.
private struct StickeredFace: View {
    let person: PostPeopleModel.Person
    let server: URL

    var body: some View {
        Face(saver: person.saver, server: server, size: 36, ring: .black)
            .overlay(alignment: .bottomTrailing) {
                if person.saved {
                    sticker(Theme.accent) {
                        Image(systemName: "bookmark.fill").font(.system(size: 9, weight: .bold)).foregroundStyle(.black)
                    }
                    .offset(x: 7, y: 6)
                }
            }
            .overlay(alignment: .topTrailing) {
                if let reaction = person.reaction {
                    sticker(Theme.cream) { Text(reaction).font(.system(size: 11)) }
                        .offset(x: 7, y: -6)
                }
            }
            .overlay(alignment: .bottomLeading) {
                if person.watched {
                    sticker(Color(hex: 0x4A453E)) {
                        Image(systemName: "eye").font(.system(size: 9, weight: .bold)).foregroundStyle(Theme.ink)
                    }
                    .offset(x: -7, y: 6)
                }
            }
            .accessibilityHidden(true)
    }

    private func sticker<Content: View>(_ fill: Color, @ViewBuilder _ content: () -> Content) -> some View {
        content()
            .frame(width: 20, height: 20)
            .background(Circle().fill(fill))
            .overlay(Circle().strokeBorder(.black, lineWidth: 2))
    }
}
