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
    @Environment(\.openURL) private var openURL
    @StateObject private var settings = SettingsModel()
    @State private var confirmRemove = false
    @State private var declining: JoinRequest?
    @State private var filtering = false
    @State private var justForMe = Prefs.justForMeByDefault
    @State private var soundOn = Prefs.soundOn

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    RoundBackButton(label: "Back to the feed")
                    Text("Settings")
                        .font(Theme.serif(32))
                        .foregroundStyle(.white)
                        .accessibilityAddTraits(.isHeader)
                }
                .padding(.bottom, 4)

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

                Text("ADHX Share \(Self.version) · Your friends have better taste than the algorithm.")
                    .font(Theme.sans(12))
                    .foregroundStyle(Theme.faint)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 6)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .refreshable { await settings.load() }
        .background(Theme.app.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .task {
            let app = model
            settings.onBadKey = { [weak app] in app?.disconnect() }
            async let people: Void = settings.load()
            async let busy: Void = refreshDoing()
            _ = await (people, busy)
        }
        .onChange(of: justForMe) { _, on in Prefs.justForMeByDefault = on }
        .onChange(of: soundOn) { _, on in Prefs.soundOn = on }
        .confirmationDialog("Remove this phone?", isPresented: $confirmRemove, titleVisibility: .visible) {
            Button("Remove this phone", role: .destructive) { model.disconnect() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This phone forgets its key and Shared lately. Your saves stay on your ADHX. To remove it there too, open Settings → Phone app on your ADHX.")
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
        .sheet(isPresented: $filtering) {
            if let feed {
                FeedFilterSheet(types: feed.types, mode: feed.mode, newCount: nil, hidden: feed.hidden,
                                setTypes: { types in Task { await feed.setTypes(types) } },
                                choose: { mode in Task { await feed.setMode(mode) } })
                    .presentationDetents([.height(660), .large])
                    .presentationDragIndicator(.visible)
                    .presentationBackground(Theme.surface)
                    .presentationCornerRadius(28)
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
        let face = settings.me?.face ?? Saver(username: username.isEmpty ? "you" : username)
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
            .accessibilityHint("Change it on your ADHX, in the browser")

            VStack(alignment: .leading, spacing: 3) {
                Text(settings.me?.shownName ?? (username.isEmpty ? "You" : username))
                    .font(Theme.sans(19, .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(youLine(username))
                    .font(Theme.sans(13))
                    .foregroundStyle(Theme.faint)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)

            Button("Change picture", action: changePicture)
                .font(Theme.sans(14, .bold))
                .foregroundStyle(Theme.cream)
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, 14)
                .frame(minHeight: 40)
                .overlay(Capsule().strokeBorder(Theme.hairline, lineWidth: 1))
                .contentShape(Capsule())
                .buttonStyle(.plain)
                .accessibilityHint("Opens Settings on your ADHX in the browser")
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

    /// No phone route takes a picture yet: change it on the web.
    private func changePicture() { openWeb("/settings#you") }

    // MARK: Waiting for you

    private var waitingCard: some View {
        VStack(alignment: .leading, spacing: 14) {
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
                    .background(Capsule().fill(Theme.accent))
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
            Text("Nobody gets in until you say yes.")
                .font(Theme.sans(12))
                .foregroundStyle(Theme.faint)
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
                Face(saver: request.asSaver, server: model.server, size: 44, ring: Theme.surface)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(request.shownName) wants in")
                        .font(Theme.sans(15, .heavy))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(invitedLine(request))
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.faint)
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
                .buttonStyle(PillButtonStyle(kind: .primary, height: 44))
                Button("Not now") {
                    Task { await settings.answer(request, .notNow) }
                }
                .buttonStyle(PillButtonStyle(kind: .outline, height: 44))
                .accessibilityHint("Hides this for a few days. They keep waiting.")
            }
            .disabled(busy)
            Button("Decline") { declining = request }
                .font(Theme.sans(13, .bold))
                .foregroundStyle(Theme.warn)
                .frame(minHeight: 44)
                .buttonStyle(.plain)
                .disabled(busy)
                .accessibilityLabel("Decline \(request.shownName)")
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
                    PeopleListView(settings: settings, server: server, invite: invite)
                } label: {
                    SettingsRow(title: "Your people") {
                        if !settings.members.isEmpty {
                            FaceStack(savers: settings.members.filter { !$0.isYou }.map(\.face),
                                      server: server, size: 24, ring: Theme.surface)
                            Text("\(settings.members.count)")
                                .font(Theme.sans(14))
                                .foregroundStyle(Theme.faint)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityValue(settings.members.isEmpty ? "" : "\(settings.members.count) people")
                divider
            }
            if settings.people?.canInvite ?? true {
                Button(action: invite) {
                    SettingsRow(title: "Invite someone", subtitle: "Makes a link on your ADHX", external: true) {
                        EmptyView()
                    }
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens your ADHX in the browser")
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

    /// No phone route makes invites yet: Settings → Your people on the web does.
    private func invite() { openWeb("/settings#people") }

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
                    .foregroundStyle(Theme.faint)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            Button("Remove this phone") { confirmRemove = true }
                .font(Theme.sans(13, .bold))
                .foregroundStyle(Theme.warn)
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
        case .checking: return Theme.faint
        }
    }

    private var waitingLinks: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(model.waiting == 1 ? "1 link is waiting to go." : "\(model.waiting) links are waiting to go.")
                .font(Theme.sans(15, .bold))
                .foregroundStyle(.white)
            Text("They go by themselves when your ADHX can be reached.")
                .font(Theme.sans(13))
                .foregroundStyle(Theme.muted)
            Button {
                Task { await model.sendWaitingNow() }
            } label: {
                HStack(spacing: 10) {
                    if model.sending { ProgressView().tint(.black) }
                    Text("Send waiting links now")
                }
            }
            .buttonStyle(PillButtonStyle(kind: .primary, height: 48))
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

    private func openWeb(_ path: String) {
        guard let server = model.server, let url = ADHXClient.resolve(path, against: server) else { return }
        openURL(url)
    }

    private static var version: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "1.0"
    }
}

// MARK: - Rows

/// A row in Settings: a title (and a line under it), whatever the screen puts
/// on the right, and a chevron (or an arrow for what opens in the browser).
struct SettingsRow<Trailing: View>: View {
    let title: String
    var subtitle: String?
    var external = false
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(Theme.sans(15, .bold))
                    .foregroundStyle(Theme.cream)
                if let subtitle {
                    Text(subtitle)
                        .font(Theme.sans(12))
                        .foregroundStyle(Theme.faint)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            trailing()
            Image(systemName: external ? "arrow.up.right" : "chevron.right")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Theme.faint)
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
                    .foregroundStyle(Theme.cream)
                if let subtitle {
                    Text(subtitle)
                        .font(Theme.sans(12))
                        .foregroundStyle(Theme.faint)
                }
            }
        }
        .tint(Theme.accent)
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
                .foregroundStyle(Theme.faint)
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
            if doing.needsYou > 0 {
                Text("\(doing.needsYou)")
                    .font(Theme.sans(11, .heavy))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 6)
                    .frame(minWidth: 20, minHeight: 20)
                    .background(Capsule().fill(Theme.accent))
                    .accessibilityHidden(true)
            }
        }
    }
}
