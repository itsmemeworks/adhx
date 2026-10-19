import SwiftUI

/// Right after pairing: "Connected to Ana's ADHX", who's here, a few things
/// your people saved this week, and Start watching.
struct ConnectedView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @StateObject private var settings = SettingsModel()
    @State private var posts: [PhonePost] = []
    @State private var page: String?

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Confetti().frame(width: 240, height: 92)
                Gob(size: 92, mood: .happy)
                    .shadow(color: Theme.accent.opacity(0.25), radius: 11, y: 10)
            }
            .padding(.top, 20)

            Label("This phone is connected", systemImage: "checkmark")
                .labelStyle(TightLabel())
                .font(Theme.sans(13, .semibold))
                .foregroundStyle(Theme.good)
                .padding(.horizontal, 12)
                .frame(height: 30)
                .background(Capsule().fill(Color(hex: 0x7FD1AE, opacity: 0.14)))
                .padding(.top, 12)

            VStack(spacing: -4) {
                Text("Connected to").foregroundStyle(Theme.ink)
                Text(whose).foregroundStyle(Theme.accent)
            }
            .font(Theme.serif(48))
            .multilineTextAlignment(.center)
            .minimumScaleFactor(0.7)
            .padding(.horizontal, 24)
            .padding(.top, 12)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            if !settings.members.isEmpty {
                HStack(spacing: 10) {
                    FaceStack(savers: settings.members.map(\.asSaver), server: model.server, size: 30,
                              ring: Theme.app, limit: 5)
                    Text(SaverWords.names(SaverWords.ordered(settings.members.map(\.asSaver)).map(\.displayName),
                                          upTo: 4))
                        .font(Theme.sans(14))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
                .padding(.top, 12)
                .accessibilityElement(children: .combine)
            }

            if !posts.isEmpty { thisWeek.padding(.top, 22) }

            Spacer(minLength: 12)

            VStack(spacing: 12) {
                Button { dismiss() } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "play.fill").font(.system(size: 16))
                        Text("Start watching")
                    }
                }
                .buttonStyle(PillButtonStyle(kind: .primary, height: 56, fontSize: 18))
                Text("Share from any app to save. Your saves are shared with your people unless you make them just for you.")
                    .font(Theme.sans(12))
                    .lineSpacing(3)
                    .foregroundStyle(Theme.faint)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            ZStack {
                Theme.app
                RadialGradient(colors: [Theme.accent.opacity(0.1), .clear], center: UnitPoint(x: 0.5, y: 0.12),
                               startRadius: 0, endRadius: 240)
            }
            .ignoresSafeArea()
        )
        .task {
            async let people: Void = settings.load()
            async let saves: Void = loadPosts()
            _ = await (people, saves)
        }
    }

    /// "Ana’s ADHX", or "your ADHX" when it's yours.
    private var whose: String {
        if let owner = settings.owner, !owner.isYou { return "\(owner.shownName)’s ADHX" }
        return "your ADHX"
    }

    private var thisWeek: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Here’s what your people saved this week")
                .font(Theme.sans(16, .heavy))
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 24)
                .accessibilityAddTraits(.isHeader)
            ScrollView(.horizontal) {
                LazyHStack(spacing: 10) {
                    ForEach(posts, id: \.key) { post in
                        WeekCard(post: post, server: model.server).id(post.key)
                    }
                }
                .scrollTargetLayout()
                .padding(.horizontal, 24)
            }
            .scrollIndicators(.hidden)
            .scrollTargetBehavior(.viewAligned)
            .scrollPosition(id: $page)
            .frame(height: 232)
            HStack(spacing: 6) {
                let current = posts.firstIndex { $0.key == page } ?? 0
                ForEach(0..<dots, id: \.self) { dot in
                    let on = min(current / 2, dots - 1) == dot
                    Capsule()
                        .fill(on ? Theme.ink : Color(hex: 0x4A453E))
                        .frame(width: on ? 18 : 6, height: 6)
                }
            }
            .frame(maxWidth: .infinity)
            .animation(.easeOut(duration: 0.2), value: page)
            .accessibilityHidden(true)
        }
    }

    /// One dot per two cards (about a screenful), up to four.
    private var dots: Int { min(4, max(1, (posts.count + 1) / 2)) }

    /// Your people's saves from the last week, newest first.
    private func loadPosts() async {
        guard let client = Store.client(),
              let page = try? await client.feed(mode: .friends, cursor: nil) else { return }
        let weekAgo = Date().addingTimeInterval(-7 * 86_400)
        let recent = page.items.filter { post in
            post.posterUrl != nil
                && post.savers.contains { !$0.isYou && (Format.date($0.savedAt) ?? .distantPast) > weekAgo }
        }
        posts = Array(recent.prefix(8))
    }
}

/// A save on the welcome screen: its poster, network, who saved it and the words.
private struct WeekCard: View {
    let post: PhonePost
    let server: URL?

    private var friends: [Saver] { SaverWords.ordered(post.savers).filter { !$0.isYou } }

    var body: some View {
        CoverImage(url: server.flatMap { ADHXClient.resolve(post.posterUrl, against: $0) })
            .frame(width: 146, height: 232)
            .overlay(alignment: .bottom) {
                LinearGradient(colors: [.clear, .black.opacity(0.9)], startPoint: .top, endPoint: .bottom)
                    .frame(height: 110)
            }
            .overlay(alignment: .topLeading) {
                Text(Network.name(post.platform))
                    .font(Theme.sans(11, .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 9)
                    .frame(height: 24)
                    .frosted(Capsule(), dim: 0.5)
                    .padding(8)
            }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        FaceStack(savers: friends, server: server, size: 22, ring: .black)
                        Text(friends.count == 1 ? "\(friends[0].displayName) saved" : SaverWords.who(friends))
                            .font(Theme.sans(12, .heavy))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                    }
                    Text(post.article?.title ?? post.text.split(separator: "\n").first.map(String.init) ?? "")
                        .font(Theme.sans(12))
                        .lineSpacing(2)
                        .foregroundStyle(.white)
                        .lineLimit(2)
                }
                .padding(10)
            }
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .accessibilityElement(children: .combine)
    }
}

/// Bits of confetti around Gob (the board's 240×92 scatter).
private struct Confetti: View {
    var body: some View {
        Canvas { context, _ in
            func bit(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ angle: Double, _ hex: UInt32) {
                var piece = context
                piece.translateBy(x: x + w / 2, y: y + h / 2)
                piece.rotate(by: .degrees(angle))
                piece.fill(Path(roundedRect: CGRect(x: -w / 2, y: -h / 2, width: w, height: h), cornerRadius: 2),
                           with: .color(Color(hex: hex)))
            }
            bit(30, 18, 10, 5, -25, 0xFF8FA3)
            bit(58, 62, 9, 5, 30, 0x7FD1AE)
            bit(176, 14, 10, 5, 35, 0xC4A7FF)
            bit(196, 56, 10, 5, -20, 0xFFB35C)
            context.fill(Path(ellipseIn: CGRect(x: 66.5, y: 18.5, width: 7, height: 7)), with: .color(Theme.accent))
            context.fill(Path(ellipseIn: CGRect(x: 165, y: 67, width: 6, height: 6)), with: .color(Color(hex: 0xFF8FA3)))
            for (x, y, hex) in [(CGFloat(14), CGFloat(48), UInt32(0xFFD23F)), (206, 34, 0x7FD1AE)] {
                var wave = Path()
                wave.move(to: CGPoint(x: x, y: y))
                wave.addQuadCurve(to: CGPoint(x: x + 12, y: y), control: CGPoint(x: x + 6, y: y - 8))
                wave.addQuadCurve(to: CGPoint(x: x + 24, y: y), control: CGPoint(x: x + 18, y: y + 8))
                context.stroke(wave, with: .color(Color(hex: hex)), style: StrokeStyle(lineWidth: 2, lineCap: .round))
            }
        }
        .accessibilityHidden(true)
    }
}
