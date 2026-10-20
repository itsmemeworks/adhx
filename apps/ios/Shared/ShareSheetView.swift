import SwiftUI

/// Our own small card, frosted so the app underneath shows through: Saving,
/// Saved, Already saved, Not a post, Offline, Not connected.
struct ShareSheetScreen: View {
    @ObservedObject var flow: ShareFlow
    @State private var shown = false
    @State private var drag: CGFloat = 0

    var body: some View {
        // iOS may show the extension as its own card. Then the content sits at
        // the card's top on one surface, instead of a sheet inside a sheet.
        ZStack(alignment: .bottom) {
            backdrop
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { flow.requestClose() }
                .accessibilityLabel("Close")
                .accessibilityAddTraits(.isButton)

            if shown {
                sheet
                    .offset(y: drag)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .onAppear {
            withAnimation(.spring(response: 0.38, dampingFraction: 0.9)) { shown = true }
        }
        .onChange(of: flow.closeRequested) { _, closing in
            guard closing else { return }
            withAnimation(.easeIn(duration: 0.22)) { shown = false }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.24) { flow.didClose() }
        }
        .animation(.easeInOut(duration: 0.2), value: flow.phase)
    }

    /// A light dim over the app (none when iOS already shows us in its own card).
    private var backdrop: Color {
        if flow.presentedInCard { return .clear }
        return Color.black.opacity(shown ? 0.3 : 0)
    }

    private var sheet: some View {
        content
        .padding(20)
        .frame(maxWidth: .infinity)
        .background {
            // Frosted: the app underneath shows through, blurred and darkened.
            let shape = RoundedRectangle(cornerRadius: 28, style: .continuous)
            shape.fill(.ultraThinMaterial)
                .overlay(shape.fill(Theme.surface.opacity(0.8)))
                .overlay(shape.strokeBorder(.white.opacity(0.1), lineWidth: 1))
                .shadow(color: .black.opacity(0.5), radius: 30, y: 24)
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
        .background {
            GeometryReader { proxy in
                Color.clear.preference(key: CardHeightKey.self, value: proxy.size.height)
            }
        }
        .onPreferenceChange(CardHeightKey.self) { height in
            if abs(flow.cardHeight - height) > 0.5 { flow.cardHeight = height }
        }
        .foregroundStyle(.white)
        .simultaneousGesture(DragGesture(minimumDistance: 0).onChanged { _ in flow.touch() })
        .gesture(
            DragGesture(minimumDistance: 8)
                .onChanged { value in drag = max(0, value.translation.height) }
                .onEnded { value in
                    if value.translation.height > 110 || value.predictedEndTranslation.height > 260 {
                        flow.requestClose()
                    } else {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { drag = 0 }
                    }
                }
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel("ADHX")
    }

    @ViewBuilder
    private var content: some View {
        switch flow.phase {
        case .reading, .saving:
            SavingContent(flow: flow)
        case .saved:
            SavedContent(flow: flow)
        case .alreadySaved:
            AlreadySavedContent(flow: flow)
        case .notAPost:
            MessageContent(
                flow: flow,
                title: "That’s not one post",
                message: "ADHX keeps single posts. Open the post itself (a Reel, a photo, a video) and share that.",
                button: "OK")
        case .offline:
            OfflineContent(flow: flow)
        case .notConnected:
            MessageContent(
                flow: flow,
                title: "Connect the app first",
                message: "Open ADHX Share and scan the code in Settings → Phone app on your ADHX.",
                button: "OK",
                showWordmark: true)
        case .problem(let title, let message):
            MessageContent(flow: flow, title: title, message: message, button: "OK")
        }
    }
}

// MARK: - Pieces

private struct SheetHeader: View {
    let closeLabel: String
    var mood: Gob.Mood = .idle
    let close: () -> Void
    var body: some View {
        HStack(spacing: 10) {
            Wordmark(mood: mood)
            Spacer(minLength: 0)
            CloseButton(label: closeLabel, action: close)
        }
    }
}

/// Network mark and name, or mark and the short link.
private struct NetworkLabel: View {
    let platform: String?
    let text: String
    var body: some View {
        HStack(spacing: 7) {
            NetworkMark(platform: platform, size: 15)
            Text(text)
                .font(Theme.sans(13, .bold))
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
                .truncationMode(.tail)
        }
    }
}

private struct Poster: View {
    let url: URL?
    let platform: String?
    let wide: Bool
    var showPlay = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: wide ? 12 : 14, style: .continuous)
        ZStack {
            shape.fill(Theme.placeholder)
            if let url {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Color.clear
                    }
                }
            }
            if showPlay {
                Circle()
                    .fill(Color.black.opacity(0.45))
                    .frame(width: 38, height: 38)
                    .overlay(
                        Image(systemName: "play.fill")
                            .font(.system(size: 15))
                            .foregroundStyle(.white)
                            .offset(x: 1)
                    )
            }
        }
        .frame(width: wide ? 112 : 72, height: wide ? 63 : 96)
        .clipShape(shape)
        .accessibilityHidden(true)
    }
}

private struct SkeletonBar: View {
    let width: CGFloat
    let height: CGFloat
    var body: some View {
        GeometryReader { geo in
            Capsule().fill(Theme.placeholder)
                .frame(width: geo.size.width * width, height: height)
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

private struct StatusBox<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 10) { content }
            .padding(.vertical, 14)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color.black))
            .accessibilityElement(children: .combine)
    }
}

private struct ProgressBar: View {
    let fraction: Double
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.12))
                Capsule().fill(Theme.accent)
                    .frame(width: geo.size.width * min(1, max(0, fraction)))
                    .animation(.easeOut(duration: 0.4), value: fraction)
            }
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }
}

private struct ButtonsRow: View {
    @ObservedObject var flow: ShareFlow
    var body: some View {
        HStack(spacing: 10) {
            Button("Open in ADHX") { flow.openInADHX() }
                .buttonStyle(PillButtonStyle(kind: .raised, fontSize: 16))
            Button("Done") { flow.requestClose() }
                .buttonStyle(PillButtonStyle(kind: .primary))
        }
    }
}

private func playable(_ platform: String?, _ category: String?) -> Bool {
    if let category, category.lowercased().contains("video") { return true }
    return ["tiktok", "youtube", "vimeo", "twitch"].contains(platform ?? "")
}

/// Who will see this save, and the "Just for me" switch.
private struct Audience: View {
    @ObservedObject var flow: ShareFlow
    /// "Add a note", once the post is saved.
    var withNote = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            who
            if withNote { NoteField(flow: flow) }
            JustForMeSwitch(isOn: flow.justForMe, busy: flow.privacyBusy) { flow.setJustForMe($0) }
            if let error = flow.privacyError {
                Text(error)
                    .font(Theme.sans(13))
                    .foregroundStyle(Theme.warn)
            }
        }
    }

    private var who: some View {
        HStack(spacing: 12) {
            if flow.justForMe {
                Image(systemName: "lock")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.black)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Theme.ink))
                Text("Only you will see this save. It’s still kept and searchable.")
            } else {
                if !flow.people.isEmpty {
                    FaceStack(savers: flow.people, server: flow.server, size: 30,
                              ring: Color(hex: 0x22201C), limit: 4)
                }
                Text(audienceLine)
            }
        }
        .font(Theme.sans(15, .semibold))
        .lineSpacing(2)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)
            shape.fill(.white.opacity(0.06))
                .overlay {
                    if flow.justForMe {
                        shape.strokeBorder(.white.opacity(0.16), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    }
                }
        }
        .accessibilityElement(children: .combine)
        .animation(.easeInOut(duration: 0.2), value: flow.justForMe)
    }

    /// "Ana, Ben, Mum and Jo will see it", or "Your people will see it".
    private var audienceLine: String {
        let names = flow.people.map(\.displayName)
        guard !names.isEmpty else { return "Your people will see it" }
        return SaverWords.names(names, upTo: 4) + " will see it"
    }
}

/// "Just for me": a lock, the words and a switch. Used on the share card and
/// in the player's More sheet.
struct JustForMeSwitch: View {
    let isOn: Bool
    var busy = false
    let change: (Bool) -> Void

    var body: some View {
        Toggle(isOn: Binding(get: { isOn }, set: { change($0) })) {
            HStack(spacing: 12) {
                ZStack {
                    if busy {
                        RingSpinner(size: 18, lineWidth: 2, track: .clear)
                    } else {
                        Image(systemName: "lock")
                            .font(.system(size: 16, weight: .semibold))
                    }
                }
                .foregroundStyle(isOn ? .black : Theme.muted)
                .frame(width: 40, height: 40)
                .background(Circle().fill(isOn ? Theme.accent : Theme.plate))
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Just for me")
                        .font(Theme.sans(16, .semibold))
                        .foregroundStyle(Theme.ink)
                    Text(isOn ? "Your people won’t see this save" : "Keep it private. Still kept, still searchable.")
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.faint)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .toggleStyle(BoardSwitchStyle())
        .disabled(busy)
        .frame(minHeight: 48)
        .accessibilityHint("Only you will see this save. It’s still kept and searchable.")
    }
}

// MARK: - States

private struct SavingContent: View {
    @ObservedObject var flow: ShareFlow
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            SheetHeader(closeLabel: "Cancel", mood: .busy) { flow.requestClose() }

            HStack(alignment: .top, spacing: 14) {
                Poster(url: nil, platform: flow.platform, wide: Network.isWide(flow.platform))
                VStack(alignment: .leading, spacing: 10) {
                    NetworkLabel(platform: flow.platform, text: Network.name(flow.platform))
                    SkeletonBar(width: 0.7, height: 16)
                    SkeletonBar(width: 0.9, height: 12)
                    SkeletonBar(width: 0.6, height: 12)
                    if let link = flow.link {
                        Text(Links.short(link))
                            .font(Theme.sans(12))
                            .foregroundStyle(Theme.faint)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            StatusBox {
                HStack(spacing: 12) {
                    RingSpinner(size: 22, lineWidth: 3, track: Theme.raised)
                    Text("Saving to your ADHX…")
                        .font(Theme.sans(17, .heavy))
                }
                .padding(.vertical, 2)
            }

            Audience(flow: flow)

            Text("You can close this. Your ADHX carries on, and the post shows up in My saves once it’s ready.")
                .font(Theme.sans(13))
                .lineSpacing(3)
                .foregroundStyle(Theme.faint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Saved: a tall poster with a check (or a lock) on its corner, the small
/// wordmark, "Saved for your people", the network and the copy's progress;
/// then who will see it, a note, Just for me, and Open / Done.
private struct SavedContent: View {
    @ObservedObject var flow: ShareFlow

    var body: some View {
        let wide = Network.isWide(flow.platform)
        let hasPoster = flow.posterURL != nil
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 16) {
                Group {
                    if hasPoster {
                        TallPoster(url: flow.posterURL, wide: wide)
                    } else {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(Theme.placeholder)
                            .frame(width: 84, height: 84)
                            .overlay(NetworkMark(platform: flow.platform, size: 28))
                    }
                }
                .overlay(alignment: .bottomTrailing) {
                    Image(systemName: flow.justForMe ? "lock" : "checkmark")
                        .font(.system(size: 12, weight: .heavy))
                        .foregroundStyle(.black)
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(flow.justForMe ? Theme.ink : Theme.accent))
                        .padding(3)
                        .background(Circle().fill(Theme.surface))
                        .offset(x: 9, y: 9)
                        .accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 8) {
                    Wordmark(markSize: 20, textSize: 20)
                    Text(flow.justForMe ? "Saved, just for you" : "Saved for your people")
                        .font(Theme.serif(34))
                        .lineSpacing(-3)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    Text(flow.networkName)
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.faint)
                        .lineLimit(1)
                    if !hasPoster, let title = flow.title {
                        Text(title)
                            .font(Theme.sans(14, .semibold))
                            .lineLimit(2)
                    }
                    Spacer(minLength: 0)
                    KeepProgress(keep: flow.keep)
                }
                .frame(maxWidth: .infinity, minHeight: hasPoster && !wide ? 148 : nil, alignment: .topLeading)
            }
            // As tall as the poster: the progress sits along its bottom.
            .fixedSize(horizontal: false, vertical: true)

            Audience(flow: flow, withNote: true)

            ButtonsRow(flow: flow)
        }
    }
}

/// The post's poster on the Saved card: tall (84×148), or a wide one cropped to fit.
private struct TallPoster: View {
    let url: URL?
    let wide: Bool

    var body: some View {
        Theme.placeholder
            .overlay {
                AsyncImage(url: url) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() } else { Color.clear }
                }
            }
            .frame(width: 84, height: wide ? 84 : 148)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// "Add a note": a line said with the save, up to 140 characters.
private struct NoteField: View {
    @ObservedObject var flow: ShareFlow
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Add a note")
                .font(Theme.sans(13, .semibold))
                .foregroundStyle(Theme.muted)
                .accessibilityHidden(true)
            TextField("", text: $flow.note,
                      prompt: Text(flow.justForMe ? "A note to future you" : "Say why they’ll like it")
                          .foregroundColor(Theme.faint))
                .font(Theme.sans(16))
                .foregroundStyle(Theme.ink)
                .tint(Theme.accent)
                .focused($focused)
                .submitLabel(.done)
                .onSubmit { focused = false }
                .onChange(of: flow.note) { _, text in
                    if text.count > ShareFlow.noteLimit { flow.note = String(text.prefix(ShareFlow.noteLimit)) }
                }
                .onChange(of: focused) { _, now in if now { flow.touch() } }
                .padding(.horizontal, 16)
                .frame(height: 48)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.app))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(focused || !flow.note.isEmpty ? Theme.accent.opacity(0.6) : .white.opacity(0.12),
                                  lineWidth: 1))
                .accessibilityLabel("Add a note")
                .accessibilityHint("Your people see it with the save. Up to \(ShareFlow.noteLimit) characters.")
        }
    }
}

/// "Keeping a copy · 720p    60%" and the bar, once the server has said.
private struct KeepProgress: View {
    let keep: StatusResult?

    var body: some View {
        if let keep, keep.status != "off" {
            let (line, tone) = Format.keepLine(status: keep.status, percent: keep.percent,
                                               quality: keep.quality, kept: keep.kept, withPercent: false)
            let showsBar = keep.status == "keeping" || keep.status == "kept"
            let percent = keep.status == "kept" ? 100 : keep.percent
            VStack(alignment: .leading, spacing: 6) {
                Text(showsBar && percent != nil && keep.status != "kept" ? "\(line) · \(percent!)%" : line)
                    .font(Theme.sans(12, .semibold))
                    .foregroundStyle(tone == .warn ? Theme.warn : Theme.muted)
                    .lineLimit(1)
                if showsBar {
                    ProgressBar(fraction: Double(percent ?? 0) / 100)
                }
            }
        }
    }
}

private struct AlreadySavedContent: View {
    @ObservedObject var flow: ShareFlow

    private var subtitle: String {
        var parts = [Format.savedAgo(flow.result?.savedAt)]
        if let keep = flow.keep {
            switch keep.status {
            case "kept": parts.append(keep.quality.map { "kept in \($0)" } ?? "kept")
            case "keeping", "waiting", "retrying": parts.append("keeping a copy")
            default: break
            }
        }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .center, spacing: 14) {
                if flow.posterURL != nil {
                    Poster(url: flow.posterURL, platform: flow.platform, wide: true)
                } else {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Theme.placeholder)
                        .frame(width: 63, height: 63)
                        .overlay(NetworkMark(platform: flow.platform, size: 24))
                }
                VStack(alignment: .leading, spacing: 6) {
                    NetworkLabel(platform: flow.platform, text: flow.networkName)
                    if let title = flow.title {
                        Text(title)
                            .font(Theme.sans(15, .heavy))
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }

            StatusBox {
                HStack(spacing: 10) {
                    Image(systemName: "bookmark.fill")
                        .font(.system(size: 19))
                        .foregroundStyle(Theme.accent)
                        .frame(width: 22, height: 22)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Already in your saves")
                            .font(Theme.sans(16, .heavy))
                        Text(subtitle)
                            .font(Theme.sans(13))
                            .foregroundStyle(Theme.muted)
                    }
                }
            }

            Audience(flow: flow)

            ButtonsRow(flow: flow)
        }
    }
}

private struct OfflineContent: View {
    @ObservedObject var flow: ShareFlow
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let link = flow.link {
                NetworkLabel(platform: flow.platform, text: Links.short(link))
            }
            StatusBox {
                HStack(alignment: .center, spacing: 12) {
                    Image(systemName: "clock")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                        .frame(width: 22, height: 22)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Saved for later")
                            .font(Theme.sans(16, .heavy))
                        Text("Your ADHX can’t be reached right now. This goes as soon as it can.")
                            .font(Theme.sans(13))
                            .foregroundStyle(Theme.muted)
                            .lineSpacing(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.vertical, 2)
            }
            Button("Done") { flow.requestClose() }
                .buttonStyle(PillButtonStyle(kind: .primary))
        }
    }
}

private struct MessageContent: View {
    @ObservedObject var flow: ShareFlow
    let title: String
    let message: String
    let button: String
    var showWordmark = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if showWordmark {
                Wordmark()
            } else if let link = flow.link {
                NetworkLabel(platform: flow.platform, text: Links.short(link))
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(Theme.serif(30))
                    .accessibilityAddTraits(.isHeader)
                Text(message)
                    .font(Theme.sans(14))
                    .foregroundStyle(Theme.muted)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button(button) { flow.requestClose() }
                .buttonStyle(PillButtonStyle(kind: .primary))
        }
    }
}

/// The card's height, measured for the extension's preferred sheet size.
private struct CardHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
