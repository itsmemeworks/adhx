import SwiftUI

/// Settings, opened from Gob: you, who's waiting to be let in (admins), your
/// people, invites, what's in your feed, defaults, what your ADHX is doing,
/// this phone's connection and Shared lately.
struct SettingsView: View {
    /// For Shared lately, which opens its posts in the player.
    var library: LibraryModel?
    /// For "What's in your feed" (the New tab's own filter).
    var feed: FeedModel?
    /// For "What your ADHX is doing".
    var doing: DoingModel?
    @EnvironmentObject private var model: AppModel
    @StateObject private var settings = SettingsModel()
    @ObservedObject private var yours = YourFace.shared
    @State private var changingPicture = false
    @State private var inviting = false
    @State private var confirmRemove = false
    @State private var declining: JoinRequest?
    @State private var filtering = false
    @State private var justForMe = Prefs.justForMeByDefault
    @State private var soundOn = Prefs.soundOn

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    RoundBackButton(label: "Back to the feed")
                    Text("Settings")
                        .font(Theme.serif(32))
                        .foregroundStyle(Theme.ink)
                        .accessibilityAddTraits(.isHeader)
                }
                .frame(height: 52)

                youCard
                if !settings.requests.isEmpty { waitingCard }
                rows
                if let error = settings.loadError, settings.people == nil {
                    Text(error)
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.warn)
                        .fixedSize(horizontal: false, vertical: true)
                }
                connectionCard
                if model.waiting > 0 { waitingLinks }
                if let library { sharedLately(library) }

                VStack(spacing: 4) {
                    // Which release this phone runs, to match against the GitHub tags.
                    Text("ADHX Share \(Self.version)")
                        .font(Theme.sans(12, .bold))
                        .foregroundStyle(Theme.inkSoft)
                        .textSelection(.enabled)
                    Text("Your friends have better taste than the algorithm.")
                        .font(Theme.sans(12))
                        .foregroundStyle(Theme.inkFaint)
                }
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.top, 6)
            }
            .padding(.horizontal, 16)
            .padding(.top, 0)
            .padding(.bottom, 24)
        }
        .refreshable { await settings.load() }
        .background(Theme.bg.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .task {
            let app = model
            settings.onBadKey = { [weak app] in app?.disconnect() }
            async let people: Void = settings.load()
            async let busy: Void = refreshDoing()
            _ = await (people, busy)
        }
        .onChange(of: justForMe) { _, on in Prefs.justForMeByDefault = on }
        .onChange(of: soundOn) { _, on in
            Prefs.soundOn = on
            NotificationCenter.default.post(name: Playback.choicesChanged, object: nil)
        }
        .confirmationDialog("Remove this phone?", isPresented: $confirmRemove, titleVisibility: .visible) {
            Button("Remove this phone", role: .destructive) {
                Task { await model.removeThisPhone() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your ADHX stops accepting this phone, and it forgets its key and Shared lately. Your saves stay on your ADHX.")
        }
        .confirmationDialog(declining.map { "Keep \($0.shownName) out?" } ?? "",
                            isPresented: Binding(get: { declining != nil }, set: { if !$0 { declining = nil } }),
                            titleVisibility: .visible, presenting: declining) { request in
            Button("Decline", role: .destructive) {
                Task { await settings.answer(request, .decline) }
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("They won’t get in with this invite.")
        }
        .pictureChanger(isPresented: $changingPicture, server: model.server,
                        onChanged: { Task { await settings.load() } },
                        onBadKey: { model.disconnect() })
        .inviteSheet(isPresented: $inviting, onBadKey: { model.disconnect() })
        .boardSheet(isPresented: $filtering, height: 590) {
            if let feed {
                FeedFilterSheet(types: feed.types, mode: feed.mode, newCount: nil, hidden: feed.hidden,
                                setTypes: { types in Task { await feed.setTypes(types) } },
                                choose: { mode in Task { await feed.setMode(mode) } })
            }
        }
    }

    /// The count for "What your ADHX is doing", once (the player's pill asks every 5 s).
    private func refreshDoing() async {
        await doing?.refresh()
    }

    // MARK: You

    private var youCard: some View {
        let username = settings.me?.username ?? model.username ?? ""
        // Your current picture (YourFace), not the people list's copy.
        let face = yours.you(from: settings.me?.asSaver ?? Saver(username: username.isEmpty ? "you" : username))
        return HStack(spacing: 14) {
            Button(action: changePicture) {
                Face(saver: face, server: model.server, size: 64, ring: Face.colour(for: face.username))
                    .overlay(alignment: .bottomTrailing) {
                        Image(systemName: "pencil")
                            .font(.system(size: 12, weight: .heavy))
                            .foregroundStyle(.black)
                            .frame(width: 24, height: 24)
                            .background(Circle().fill(Theme.accent))
                            .overlay(Circle().strokeBorder(Theme.surface, lineWidth: 3))
                            .offset(x: 3, y: 3)
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Your picture")
            .accessibilityHint("Choose a photo, take a selfie or pick a Gob")

            VStack(alignment: .leading, spacing: 3) {
                Text(settings.me?.shownName ?? (username.isEmpty ? "You" : username))
                    .font(Theme.sans(19, .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(youLine(username))
                    .font(Theme.sans(13))
                    .foregroundStyle(Theme.inkFaint)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)

            Button("Change picture", action: changePicture)
                .font(Theme.sans(14, .bold))
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, 14)
                .frame(minHeight: 40)
                .overlay(Capsule(style: .continuous).strokeBorder(.white.opacity(0.25), lineWidth: 1.5))
                .contentShape(Capsule(style: .continuous))
                .buttonStyle(.plain)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Theme.surface))
    }

    private func youLine(_ username: String) -> String {
        var parts: [String] = []
        if !username.isEmpty { parts.append("@\(username)") }
        if let saves = settings.me?.saves { parts.append(saves == 1 ? "1 save" : "\(saves) saves") }
        return parts.joined(separator: " · ")
    }

    private func changePicture() { changingPicture = true }

    // MARK: Waiting for you

    private var waitingCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text("WAITING FOR YOU")
                    .font(Theme.sans(13, .heavy))
                    .tracking(0.8)
                    .foregroundStyle(Theme.accent)
                Text("\(settings.requests.count)")
                    .font(Theme.sans(11, .heavy))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 6)
                    .frame(minWidth: 20, minHeight: 20)
                    .background(Capsule(style: .continuous).fill(Theme.accent))
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            ForEach(settings.requests) { request in
                requestRow(request)
            }
            if let error = settings.answerError {
                Text(error)
                    .font(Theme.sans(13, .bold))
                    .foregroundStyle(Theme.warn)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Theme.surface))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
            .strokeBorder(Theme.accent.opacity(0.45), lineWidth: 1))
    }

    private func requestRow(_ request: JoinRequest) -> some View {
        let busy = settings.answering == request.id
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Face(saver: request.asSaver, server: model.server, size: 44, ring: .clear)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(request.shownName) wants in")
                        .font(Theme.sans(15, .heavy))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(invitedLine(request))
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.inkFaint)
                        .lineLimit(1)
                }
            }
            .accessibilityElement(children: .combine)
            HStack(spacing: 8) {
                Button {
                    Task { await settings.answer(request, .approve) }
                } label: {
                    HStack(spacing: 8) {
                        if busy { ProgressView().tint(.black) }
                        Text("Let \(request.shownName) in")
                    }
                }
                // 22 − 14 inset − 1 border is under 8, so 8: follows the card's curve.
                .buttonStyle(PillButtonStyle(kind: .primary, height: 44, fontSize: 15, cornerRadius: 8))
                Button("Not now") {
                    Task { await settings.answer(request, .notNow) }
                }
                .buttonStyle(QuietOutline())
                .accessibilityHint("Hides this for a few days. They keep waiting.")
            }
            .disabled(busy)
            // Small, under the two: keeping someone out is the rare answer.
            HStack(spacing: 6) {
                Text("Nobody gets in until you say yes.")
                    .font(Theme.sans(12))
                    .foregroundStyle(Theme.inkFaint)
                Spacer(minLength: 0)
                Button("Decline") { declining = request }
                    .font(Theme.sans(12, .bold))
                    .foregroundStyle(Theme.danger)
                    .frame(minHeight: 28)
                    .contentShape(Rectangle())
                    .buttonStyle(.plain)
                    .disabled(busy)
                    .accessibilityLabel("Decline \(request.shownName)")
            }
            .padding(.top, -4)
            .padding(.bottom, -6)
        }
    }

    /// "Invited by Jo · 10m ago".
    private func invitedLine(_ request: JoinRequest) -> String {
        var parts: [String] = []
        if let inviter = request.invitedBy { parts.append("Invited by \(inviter.shownName)") }
        if let asked = Format.date(request.askedAt) {
            let ago = Format.shortAgo(asked)
            parts.append(ago == "now" ? "just now" : "\(ago) ago")
        }
        return parts.joined(separator: " · ")
    }

    // MARK: Rows

    private var rows: some View {
        VStack(spacing: 0) {
            if let server = model.server {
                NavigationLink {
                    PeopleListView(settings: settings, server: server)
                } label: {
                    SettingsRow(title: "Your people") {
                        let others = settings.members.filter { !$0.isYou }
                        if !others.isEmpty {
                            FaceStack(savers: others.map(\.face),
                                      server: server, size: 24, ring: Theme.surface)
                            // Everyone but you, like the boards' "4".
                            Text("\(others.count)")
                                .font(Theme.sans(14))
                                .foregroundStyle(Theme.inkFaint)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityValue(settings.members.count > 1 ? "\(settings.members.count - 1) others" : "")
                divider
            }
            if settings.people?.canInvite ?? true {
                Button(action: invite) {
                    SettingsRow(title: "Invite someone", subtitle: "Make a link and send it") {
                        EmptyView()
                    }
                }
                .buttonStyle(.plain)
                divider
            }
            if let feed, !feed.unsupported {
                Button { filtering = true } label: {
                    FeedTypesRow(feed: feed)
                }
                .buttonStyle(.plain)
                divider
            }
            ToggleRow(title: "Just for me by default", subtitle: "New saves from this phone start private",
                      isOn: $justForMe)
            divider
            ToggleRow(title: "Sound on by default", subtitle: nil, isOn: $soundOn)
            if let doing, let server = model.server, !doing.unsupported {
                divider
                NavigationLink {
                    DoingScreen(doing: doing, server: server)
                } label: {
                    DoingSettingsRow(doing: doing)
                }
                .buttonStyle(.plain)
            }
        }
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Theme.surface))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var divider: some View {
        Rectangle().fill(.white.opacity(0.06)).frame(height: 1)
    }

    private func invite() { inviting = true }

    // MARK: This phone

    private var connectionCard: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(dotColour)
                .frame(width: 9, height: 9)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(connectedTitle)
                    .font(Theme.sans(14, .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                Text(Links.displayHost(model.server))
                    .font(Theme.sans(12))
                    .foregroundStyle(Theme.inkFaint)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            Button(model.removing ? "Removing…" : "Remove this phone") { confirmRemove = true }
                .disabled(model.removing)
                .font(Theme.sans(13, .bold))
                .foregroundStyle(Theme.danger)
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, 10)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
                .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Theme.surface))
    }

    private var connectedTitle: String {
        switch model.connection {
        case .unreachable: return "Can’t reach your ADHX right now"
        case .checking, .connected:
            if let owner = settings.owner, !owner.isYou { return "Connected to \(owner.shownName)’s ADHX" }
            return "Connected to your ADHX"
        }
    }

    private var dotColour: Color {
        switch model.connection {
        case .connected: return Theme.good
        case .unreachable: return Theme.warn
        case .checking: return Theme.inkFaint
        }
    }

    private var waitingLinks: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(model.waiting == 1 ? "1 link is waiting to go." : "\(model.waiting) links are waiting to go.")
                .font(Theme.sans(15, .bold))
                .foregroundStyle(.white)
            Text("They go by themselves when your ADHX can be reached.")
                .font(Theme.sans(13))
                .foregroundStyle(Theme.inkSoft)
            Button {
                Task { await model.sendWaitingNow() }
            } label: {
                HStack(spacing: 10) {
                    if model.sending { ProgressView().tint(.black) }
                    Text("Send waiting links now")
                }
            }
            // 22 − 16 inset is under 8, so 8: follows the card's curve.
            .buttonStyle(PillButtonStyle(kind: .primary, height: 48, cornerRadius: 8))
            .disabled(model.sending)
            .padding(.top, 4)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Theme.surface))
    }

    private func sharedLately(_ library: LibraryModel) -> some View {
        NavigationLink {
            SharedLatelyView(library: library)
        } label: {
            SettingsRow(title: "Shared lately", subtitle: "What you’ve shared from this phone") { EmptyView() }
                .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Theme.surface))
        }
        .buttonStyle(.plain)
        .accessibilityHint("How each copy is coming along")
    }

    // MARK: Helpers

    /// Which release this build is: "2.2.0", or "2.2.0 +3 · abc1234" when
    /// it's built from commits after that tag (written by Config/stamp-version.sh).
    static let version: String = {
        if let url = Bundle.main.url(forResource: "build-info", withExtension: "txt"),
           let words = try? String(contentsOf: url, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines), !words.isEmpty {
            return words
        }
        return (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "1.0"
    }()
}

// MARK: - Rows

/// A row in Settings: a title (and a line under it), whatever the screen puts
/// on the right, and a chevron.
struct SettingsRow<Trailing: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(Theme.sans(15, .bold))
                    .foregroundStyle(Theme.ink)
                if let subtitle {
                    Text(subtitle)
                        .font(Theme.sans(12))
                        .foregroundStyle(Theme.inkFaint)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            trailing()
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Theme.inkFaint)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: subtitle == nil ? 56 : 64)
        .contentShape(Rectangle())
    }
}

private struct ToggleRow: View {
    let title: String
    let subtitle: String?
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(Theme.sans(15, .bold))
                    .foregroundStyle(Theme.ink)
                if let subtitle {
                    Text(subtitle)
                        .font(Theme.sans(12))
                        .foregroundStyle(Theme.inkFaint)
                }
            }
        }
        .toggleStyle(BoardSwitchStyle())
        .padding(.horizontal, 16)
        .frame(minHeight: subtitle == nil ? 56 : 64)
    }
}

/// "What's in your feed · Videos, photos".
private struct FeedTypesRow: View {
    @ObservedObject var feed: FeedModel

    var body: some View {
        SettingsRow(title: "What’s in your feed") {
            Text(line)
                .font(Theme.sans(14))
                .foregroundStyle(Theme.inkFaint)
                .lineLimit(1)
        }
    }

    private var line: String {
        let names = FeedType.allCases.filter(feed.types.contains).map { type -> String in
            switch type {
            case .video: return "videos"
            case .photo: return "photos"
            case .text: return "text"
            case .article: return "articles"
            }
        }
        let joined = names.joined(separator: ", ")
        return joined.prefix(1).uppercased() + joined.dropFirst()
    }
}

/// "What your ADHX is doing · 3 on their way · 1 needs you".
private struct DoingSettingsRow: View {
    @ObservedObject var doing: DoingModel

    var body: some View {
        SettingsRow(title: "What your ADHX is doing",
                    subtitle: doing.line ?? (doing.loadedOnce ? "Nothing on its way" : nil)) {
            EmptyView()
        }
    }
}

/// "Not now": the outline button (1.5pt white .25), 15/700 (the boards' quiet
/// second answer). It sits in the waiting card: 22 − 14 inset − 1.5 border is
/// under 8, so 8.
private struct QuietOutline: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: 8, style: .continuous)
        return configuration.label
            .font(Theme.sans(15, .bold))
            .foregroundStyle(Theme.ink)
            .frame(maxWidth: .infinity, minHeight: 44)
            .overlay(shape.strokeBorder(.white.opacity(0.25), lineWidth: 1.5))
            .contentShape(shape)
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}
