import SwiftUI
import UIKit

/// Live (`/api/app/live`): moments your lot are saving into right now.
@MainActor
final class LiveModel: ObservableObject {
    @Published private(set) var moments: [LiveMoment] = []
    /// Groups not live yet ("1 more save to go live").
    @Published private(set) var forming: [FormingMoment] = []
    /// The window the moments come from: "Right now", "Last few days".
    @Published private(set) var label: String?
    @Published private(set) var loadedOnce = false
    @Published private(set) var loadError: String?
    @Published private(set) var unsupported = false

    /// A forming group whose bell is being rung (or unrung).
    @Published private(set) var ringing: Set<String> = []
    /// Words for a bell that didn't take.
    @Published private(set) var alertProblem: String?
    /// A moment to tune in to as soon as Live is on screen (a tapped notification).
    @Published var tuneIn: LiveMoment?

    var onBadKey: () -> Void = {}
    var anyLive: Bool { moments.contains(where: \.live) }

    /// "Tell me when it's live": on the first one, asks to show notifications.
    func toggleAlert(_ group: FormingMoment) async {
        guard let client = Store.client(), !ringing.contains(group.id) else { return }
        let on = !group.alert
        ringing.insert(group.id)
        alertProblem = nil
        defer { ringing.remove(group.id) }
        if on { await AlertCenter.shared.askPermission() }
        setAlert(group.id, on)
        do {
            let now = try await client.setFormingAlert(group.id, on: on)
            setAlert(group.id, now)
            if now { LiveAlertDelivery.watch() }
        } catch APIError.badKey {
            onBadKey()
        } catch let error as APIError where error.isMissing {
            // forming_gone: it formed or fell apart. Show what's there now.
            setAlert(group.id, !on)
            if error.code == "forming_gone" {
                alertProblem = "\(group.name) isn’t forming any more."
                await reload()
            } else {
                alertProblem = "Your ADHX needs an update before it can tell you."
            }
        } catch let error as APIError {
            setAlert(group.id, !on)
            alertProblem = error.message
        } catch {
            setAlert(group.id, !on)
            alertProblem = APIError.offline.message
        }
    }

    private func setAlert(_ id: String, _ on: Bool) {
        guard let index = forming.firstIndex(where: { $0.id == id }) else { return }
        forming[index].alert = on
    }

    func reload() async {
        guard let client = Store.client() else { return }
        do {
            let snapshot = try await client.live()
            moments = snapshot.moments
            // A bell being rung keeps its state until the answer comes.
            forming = snapshot.forming.map { group in
                guard ringing.contains(group.id), let mine = forming.first(where: { $0.id == group.id }) else { return group }
                var kept = group
                kept.alert = mine.alert
                return kept
            }
            if forming.contains(where: \.alert) { LiveAlertDelivery.watch() }
            label = snapshot.label
            loadError = nil
            unsupported = false
            KnownPeople.remember(moments.flatMap(\.savers))
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

    /// Looks again every 20 s while the list is on screen.
    func follow() async {
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 20_000_000_000)
            guard !Task.isCancelled else { return }
            await reload()
        }
    }

}

struct LiveView: View {
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject var model: LiveModel
    let server: URL
    @State private var tuned: LiveMoment?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                if !model.loadedOnce {
                    HStack { Spacer(); RingSpinner(size: 34, lineWidth: 3); Spacer() }
                        .padding(.top, 60)
                } else if model.unsupported {
                    EmptyNote(title: "Live isn’t here yet",
                              message: "Your ADHX needs an update before it can show what your lot are into right now.")
                } else if let error = model.loadError, model.moments.isEmpty {
                    EmptyNote(title: "Can’t see what’s live", message: error) {
                        Task { await model.reload() }
                    }
                } else if model.moments.isEmpty && model.forming.isEmpty {
                    EmptyNote(title: "Nothing’s live right now",
                              message: "When a few of your lot save around the same thing, it shows up here.")
                } else {
                    // Two lines that nearly touch (the boards' line-height 0.95):
                    // Text can't tighten its own leading before iOS 26.
                    VStack(alignment: .leading, spacing: -12) {
                        Text("What your lot are into")
                        Text("tonight")
                    }
                    .font(Theme.serif(36))
                    .foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.horizontal, 16)
                    .padding(.top, 5)
                    // The last line's descent is room enough above the first card.
                    .padding(.bottom, -3)
                    // The first one big; the quieter ones (and older servers'
                    // not-live ones) as rows, then what's still forming.
                    ForEach(Array(model.moments.enumerated()), id: \.element.id) { index, moment in
                        if index == 0 && moment.live {
                            LiveCard(moment: moment, server: server) { tuned = moment }
                        } else {
                            QuietMomentRow(moment: moment, server: server,
                                           label: moment.label ?? quietLabel(moment)) { tuned = moment }
                        }
                    }
                    .padding(.horizontal, 16)
                    ForEach(model.forming) { group in
                        FormingRow(group: group, server: server, ringing: model.ringing.contains(group.id)) {
                            Task { await model.toggleAlert(group) }
                        }
                    }
                    .padding(.horizontal, 16)
                    if let problem = model.alertProblem {
                        Text(problem)
                            .font(Theme.sans(13))
                            .foregroundStyle(Theme.warn)
                            .padding(.horizontal, 20)
                    }
                }
            }
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .scrollIndicators(.hidden)
        .refreshable { await model.reload() }
        .task(id: scenePhase == .active && tuned == nil) {
            if scenePhase == .active && tuned == nil { await model.follow() }
        }
        .fullScreenCover(item: $tuned) { moment in
            TunedInScreen(moment: moment, server: server)
        }
        .onChange(of: model.tuneIn, initial: true) { _, moment in
            guard let moment else { return }
            model.tuneIn = nil
            // The full moment when the list has it, else what the notification said.
            tuned = model.moments.first { $0.slug == moment.slug } ?? moment
        }
    }

    /// Over a quieter row: how busy it is now, else the window it's from.
    private func quietLabel(_ moment: LiveMoment) -> String? {
        if let busy = moment.busyLine { return "Live · \(busy)" }
        return model.label
    }
}

/// The red LIVE mark: a dot with soft rings that pulse (still under Reduce Motion).
struct LiveBadge: View {
    var height: CGFloat = 30
    /// A red edge, over a video (tuned in).
    var bordered = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var glow = false

    var body: some View {
        HStack(spacing: 9) {
            Circle()
                .fill(Theme.live)
                .frame(width: 9, height: 9)
                .background(Circle().fill(Theme.live.opacity(0.3)).frame(width: 17, height: 17))
                .background(Circle().fill(Theme.live.opacity(glow ? 0.2 : 0.08))
                    .frame(width: glow ? 27 : 21, height: glow ? 27 : 21))
            Text("LIVE")
                .font(Theme.sans(12, .heavy))
                .tracking(0.96)
                .foregroundStyle(.white)
        }
        .padding(.leading, bordered ? 11 : 10)
        .padding(.trailing, 12)
        .frame(height: height)
        .frosted(Capsule(style: .continuous), dim: bordered ? 0.55 : 0.6)
        .overlay(Capsule(style: .continuous).strokeBorder(Theme.live.opacity(bordered ? 0.5 : 0), lineWidth: 1))
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) { glow = true }
        }
        .accessibilityElement()
        .accessibilityLabel("Live")
    }
}

/// A live moment's covers: a tall one, two small, a wide one (the boards' grid).
private struct LiveMosaic: View {
    let covers: [String]
    let server: URL

    var body: some View {
        let urls = covers.prefix(4).map { ADHXClient.resolve($0, against: server) }
        if urls.count < 4 {
            Mosaic(covers: covers, server: server)
        } else {
            GeometryReader { box in
                let unit = (box.size.width - 4) / 3.3
                HStack(spacing: 2) {
                    CoverImage(url: urls[0]).frame(width: unit * 1.3)
                    VStack(spacing: 2) {
                        HStack(spacing: 2) { CoverImage(url: urls[1]); CoverImage(url: urls[2]) }
                        CoverImage(url: urls[3])
                    }
                }
            }
            .accessibilityHidden(true)
        }
    }
}

private struct LiveCard: View {
    let moment: LiveMoment
    let server: URL
    let tuneIn: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            LiveMosaic(covers: moment.covers, server: server)
                .frame(height: 178)
                .overlay(alignment: .topLeading) { LiveBadge().padding(10) }
                .overlay(alignment: .bottomTrailing) {
                    if let watching = watchingLine {
                        HStack(spacing: 8) {
                            if !moment.watchers.isEmpty {
                                FaceStack(savers: moment.watchers, server: server, size: 24,
                                          ring: Theme.watching)
                            }
                            Text(watching)
                                .font(Theme.sans(13, .semibold))
                                .foregroundStyle(.white)
                        }
                        .padding(.leading, moment.watchers.isEmpty ? 12 : 5)
                        .padding(.trailing, 12)
                        .frame(height: 34)
                        .frosted(Capsule(style: .continuous), dim: 0.6)
                        .padding(10)
                    }
                }
                // 26 − 8 inset − 2 border: follows the card's curve.
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            VStack(alignment: .leading, spacing: 6) {
                Text(moment.name)
                    .font(Theme.serif(32))
                    .tightLines(32)
                    // Where the board's letters sit: 12 below the strip, 8 above the meta line.
                    .padding(.top, 3)
                    .padding(.bottom, 1.5)
                    .foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if !metaLine.isEmpty {
                    Text(metaLine)
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.inkSoft)
                        .lineLimit(2)
                }
            }
            .padding(.horizontal, 6)
            Button(action: tuneIn) {
                HStack(spacing: 10) {
                    Image(systemName: "play.fill").font(.system(size: 14))
                    Text("Tune in")
                }
            }
            // 26 − 8 inset − 2 border: follows the card's curve.
            .buttonStyle(PillButtonStyle(kind: .primary, cornerRadius: 16))
            .accessibilityLabel("Tune in to \(moment.name)")
        }
        // The board's 2 pt border sits outside its 8 of padding; strokeBorder draws inside this frame.
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Theme.surface))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous)
            .strokeBorder(Theme.hue(moment.hue) ?? Theme.person2, lineWidth: 2))
    }

    /// "3 of you watching".
    private var watchingLine: String? {
        let count = max(moment.watching ?? 0, moment.watchers.count)
        guard count > 0 else { return nil }
        return count == 1 ? "1 watching" : "\(count) of you watching"
    }

    /// "3 saves in 10 min · Ana, Ben and Jo" (or "4 saves · …" when it's quiet).
    private var metaLine: String {
        var parts: [String] = []
        if let busy = moment.busyLine {
            parts.append(busy)
        } else if let posts = moment.posts {
            parts.append(posts == 1 ? "1 save" : "\(posts) saves")
        }
        if !moment.savers.isEmpty {
            parts.append(SaverWords.names(SaverWords.ordered(moment.savers).map(\.displayName)))
        } else if let people = moment.people, people > 0 {
            parts.append(people == 1 ? "1 person" : "\(people) people")
        }
        return parts.joined(separator: "  ·  ")
    }
}

/// A moment that isn't live now (a few days old, or still forming).
private struct QuietMomentRow: View {
    let moment: LiveMoment
    let server: URL
    var label: String?
    let play: () -> Void

    private var forming: Bool { label?.localizedCaseInsensitiveContains("forming") == true }

    var body: some View {
        HStack(spacing: 12) {
            CoverImage(url: ADHXClient.resolve(moment.covers.first, against: server))
                .frame(width: 76, height: 88)
                .saturation(forming ? 0.75 : 1)
                // 22 − 8 inset − 1 border: follows the row's curve.
                .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
            VStack(alignment: .leading, spacing: 5) {
                if let label {
                    if forming {
                        Text(label)
                            .font(Theme.sans(11, .heavy))
                            .foregroundStyle(Theme.accent)
                            .padding(.horizontal, 9)
                            .frame(height: 22)
                            .overlay(Capsule(style: .continuous).strokeBorder(Theme.accent.opacity(0.6),
                                                            style: StrokeStyle(lineWidth: 1, dash: [3, 2])))
                    } else {
                        Text(label.uppercased())
                            .font(Theme.sans(11, .heavy))
                            .tracking(0.88)
                            .foregroundStyle(Theme.inkFaint)
                    }
                }
                Text(moment.name)
                    .font(Theme.sans(17, .heavy))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(2)
                if !moment.savers.isEmpty {
                    HStack(spacing: 7) {
                        FaceStack(savers: moment.savers, server: server, size: 20, ring: Theme.surface)
                        Text(SaverWords.who(moment.savers))
                            .font(Theme.sans(13))
                            .foregroundStyle(Theme.inkSoft)
                            .lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 0)
            Button(action: play) {
                Image(systemName: "play.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.ink)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Theme.plate))
            }
            .accessibilityLabel("Play \(moment.name)")
        }
        .padding(.leading, 8)
        .padding(.trailing, 10)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Theme.surface))
        .overlay {
            if forming {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(.white.opacity(0.18), style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
            } else {
                RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(.white.opacity(0.08))
            }
        }
    }
}

/// A group still forming: a few saves close together, not live yet, with
/// the people saving into it and a bell: "Tell me when it's live" (j7-3).
private struct FormingRow: View {
    let group: FormingMoment
    let server: URL
    var ringing = false
    var ring: () -> Void = {}

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 12) {
                CoverImage(url: ADHXClient.resolve(group.covers.first, against: server))
                    .frame(width: 76, height: 88)
                    .saturation(0.75)
                    // 22 − 8 inset − 1.5 border: follows the row's curve.
                    .clipShape(RoundedRectangle(cornerRadius: 12.5, style: .continuous))
                VStack(alignment: .leading, spacing: 5) {
                    Text("Forming")
                        .font(Theme.sans(11, .heavy))
                        .foregroundStyle(Theme.accent)
                        .padding(.horizontal, 9)
                        .frame(height: 22)
                        .overlay(Capsule(style: .continuous).strokeBorder(Theme.accent.opacity(0.6),
                                                        style: StrokeStyle(lineWidth: 1, dash: [3, 2])))
                    Text(group.name)
                        .font(Theme.sans(17, .heavy))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(2)
                    HStack(spacing: 7) {
                        if !group.savers.isEmpty {
                            FaceStack(savers: group.savers, server: server, size: 20, ring: Theme.surface, limit: 4)
                        }
                        Text(group.toGoLine)
                            .font(Theme.sans(13))
                            .foregroundStyle(Theme.inkSoft)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(accessibilityWords)
            bell
        }
        .padding(.leading, 8)
        .padding(.trailing, 10)
        .padding(.vertical, 8)
        .frame(minHeight: 104)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Theme.surface))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
            .strokeBorder(.white.opacity(0.18), style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
    }

    /// "Kitchen synths, forming, Jo and Ben, 1 more save to go live".
    private var accessibilityWords: String {
        var parts = [group.name, "forming"]
        if !group.savers.isEmpty { parts.append(SaverWords.who(group.savers)) }
        parts.append(group.toGoLine)
        return parts.joined(separator: ", ")
    }

    private var bell: some View {
        Button(action: ring) {
            Image(systemName: group.alert ? "bell.fill" : "bell")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(group.alert ? .black : Theme.ink)
                .frame(width: 44, height: 44)
                .background(Circle().fill(group.alert ? Theme.accent : Theme.plate))
                .contentShape(Circle())
                .opacity(ringing ? 0.6 : 1)
                .animation(.easeInOut(duration: 0.15), value: group.alert)
        }
        .buttonStyle(.plain)
        .disabled(ringing)
        .accessibilityLabel("Tell me when \(group.name) is live")
        .accessibilityValue(group.alert ? "On" : "Off")
        .accessibilityAddTraits(group.alert ? .isSelected : [])
    }
}

// MARK: - Tuned in

/// One moment, tuned in (`/api/app/live/{slug}`, every 5 s): who else is
/// watching, new saves slotted in up next, and reactions floating up.
@MainActor
final class TunedInModel: ObservableObject {
    let slug: String
    @Published private(set) var moment: LiveMoment
    @Published private(set) var items: [PhonePost] = []
    @Published private(set) var watchers: [Saver] = []
    @Published private(set) var loadedOnce = false
    @Published private(set) var gone = false
    @Published private(set) var loadError: String?
    /// "Jo just saved one", for a few seconds after a new save lands.
    @Published private(set) var arrival: Saver?
    /// The poster of the save that just landed, beside "Jo just saved one".
    @Published private(set) var arrivalPoster: String?
    @Published var currentIndex = 0
    /// Reactions on their way up the screen (yours after acknowledgement, others from the poll).
    @Published private(set) var floating: [FloatingReaction] = []
    private var arrivalTask: Task<Void, Never>?
    /// Reactions already shown (or already old when you tuned in).
    private var shownReactions = Set<String>()

    init(moment: LiveMoment) {
        slug = moment.slug
        self.moment = moment
        watchers = moment.watchers
    }

    var current: PhonePost? { items.indices.contains(currentIndex) ? items[currentIndex] : nil }

    /// People watching besides you.
    var others: [Saver] { watchers.filter { !$0.isYou } }

    func follow() async {
        guard let client = Store.client() else { return }
        let session = UUID().uuidString
        defer {
            // A separate task can send leave even though the screen's poll task was cancelled.
            Task { try? await client.leaveLive(slug: slug, session: session) }
        }
        while !Task.isCancelled {
            await refresh(watching: session)
            if gone { return }
            try? await Task.sleep(nanoseconds: 5_000_000_000)
        }
    }

    func refresh(watching session: String? = nil) async {
        guard let client = Store.client() else { return }
        do {
            let detail = try await client.live(slug: slug, watching: session, known: items.map(\.key))
            guard !Task.isCancelled else { return }
            if let moment = detail.moment { self.moment = moment }
            watchers = detail.watchers
            let first = !loadedOnce
            merge(detail.items, removed: Set(detail.removedKeys), saverUpdates: Dictionary(detail.saverUpdates.map { ($0.key, $0) }, uniquingKeysWith: { _, latest in latest }))
            take(detail.reactions, quietly: first)
            gone = false
            loadError = nil
        } catch is CancellationError { return
        } catch let error as APIError where error.isMissing {
            gone = true
            items = []
            watchers = []
        } catch APIError.badKey {
            items = []
            watchers = []
            gone = true
        } catch {
            loadError = (error as? APIError)?.message ?? APIError.offline.message
        }
        loadedOnce = true
    }

    /// New saves go right after the one on screen ("up next").
    private func merge(_ fresh: [PhonePost], removed: Set<String>, saverUpdates: [String: LiveSaverUpdate]) {
        let playing = current?.key
        let have = Set(items.map(\.key))
        let new = fresh.filter { !have.contains($0.key) && !removed.contains($0.key) }
        items = mergeLiveQueue(current: items, fresh: fresh, removed: removed, playing: playing, saverUpdates: saverUpdates)
        if let playing, let index = items.firstIndex(where: { $0.key == playing }) { currentIndex = index }
        else { currentIndex = min(currentIndex, max(0, items.count - 1)) }
        guard loadedOnce else { return }
        if let post = new.first, let saver = post.savers.first(where: { !$0.isYou }) {
            arrival = saver
            arrivalPoster = post.posterUrl
            arrivalTask?.cancel()
            arrivalTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                guard !Task.isCancelled else { return }
                self?.arrival = nil
            }
        }
    }

    /// Others' reactions from the poll float up; the ones already there when
    /// you tuned in don't. Yours floated when you sent them.
    private func take(_ reactions: [LiveReactionEvent], quietly: Bool) {
        if shownReactions.count > 1000 { shownReactions = Set(reactions.map(\.id).filter { shownReactions.contains($0) }) }
        var queued = 0
        for reaction in reactions where shownReactions.insert(reaction.id).inserted {
            guard !quietly, !reaction.saver.isYou else { continue }
            // Ones that arrive together rise 0.7 s apart.
            let delay = UInt64(queued) * 700_000_000
            queued += 1
            if delay == 0 {
                float(reaction)
            } else {
                Task { [weak self] in
                    try? await Task.sleep(nanoseconds: delay)
                    self?.float(reaction)
                }
            }
        }
    }

    private func float(_ reaction: LiveReactionEvent) {
        let item = FloatingReaction(event: reaction, lane: CGFloat.random(in: 0.05...0.75))
        floating.append(item)
        if floating.count > 12 { floating.removeFirst(floating.count - 12) }
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: FloatingReaction.lifeNanos)
            self?.floating.removeAll { $0.id == item.id }
        }
    }

    /// Sends an emoji or a few words about the post on screen, and floats it
    /// with your face after the server accepts it.
    func react(_ say: LiveSay, you: Saver, to post: PostRef) async -> Bool {
        guard let client = Store.client() else { return false }
        do {
            try await client.react(slug: slug, say, to: post)
            switch say {
            case .emoji(let emoji):
                float(LiveReactionEvent(id: UUID().uuidString, saver: you, emoji: emoji, text: nil))
            case .text(let text):
                float(LiveReactionEvent(id: UUID().uuidString, saver: you, emoji: nil, text: text))
            }
            return true
        } catch {
            return false
        }
    }

}

struct TunedInScreen: View {
    @StateObject private var model: TunedInModel
    let server: URL
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var clean = false
    @State private var scrubbing = false
    @State private var note: String?
    @State private var picking = false
    @State private var words = ""
    @State private var sending = false
    @State private var retry: (say: LiveSay, post: PostRef)?
    @State private var reactionPost: PostRef?
    @FocusState private var typing: Bool

    init(moment: LiveMoment, server: URL) {
        _model = StateObject(wrappedValue: TunedInModel(moment: moment))
        self.server = server
    }

    var body: some View {
        ZStack(alignment: .top) {
            if !model.items.isEmpty {
                PlayerView(posts: model.items, server: server, clean: $clean, scrubbing: $scrubbing,
                           extras: PlayerExtras(bottomInset: picking ? 146 : 0, toastTop: 120,
                                                react: .init(isOpen: picking, toggle: togglePicker),
                                                inMoment: model.moment.name, railSpacing: 8,
                                                progressColour: Theme.accent)) { index in
                    model.currentIndex = index
                }
            } else {
                VStack(spacing: 16) {
                    if model.loadedOnce {
                        Text(model.loadError != nil ? "Can’t reach this room" : (model.gone ? "This one’s over." : "Nothing in it yet."))
                            .font(Theme.serif(34))
                            .foregroundStyle(.white)
                        Text(model.loadError ?? (model.gone ? "Everyone’s moved on. Plenty more on Home." : "Hang on, your lot are saving."))
                            .font(Theme.sans(15))
                            .foregroundStyle(Theme.inkSoft)
                        if model.loadError != nil {
                            Button("Try again") { Task { await model.refresh() } }.buttonStyle(PillButtonStyle(kind: .primary))
                        }
                    } else {
                        RingSpinner(size: 34, lineWidth: 3)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Theme.bg.ignoresSafeArea())
            }
            FloatingReactions(reactions: model.floating, server: server)
                .padding(.top, 200)
                .padding(.trailing, 80)
                .frame(height: 500, alignment: .top)
                .allowsHitTesting(false)
            if !clean && !scrubbing {
                topBar
                if picking {
                    // From the screen's edge, but above the keyboard while typing.
                    VStack {
                        Spacer()
                        picker
                            .padding(.horizontal, 12)
                            .padding(.bottom, typing ? 8 : 30)
                    }
                    .ignoresSafeArea(.container, edges: .bottom)
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .background(Theme.stage.ignoresSafeArea())
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: model.arrival)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: picking)
        .task(id: scenePhase) {
            if scenePhase == .active { await model.follow() }
        }
    }

    private var topBar: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                LiveBadge(height: 40, bordered: true)
                watchersChip
                Spacer(minLength: 0)
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .frosted(Circle(), dim: 0.45)
                }
                .accessibilityLabel("Leave live")
            }
            if let saver = model.arrival {
                // A card from the right: the save's poster with their face on its corner.
                HStack(spacing: 11) {
                    CoverImage(url: ADHXClient.resolve(model.arrivalPoster, against: server))
                        .frame(width: 42, height: 42)
                        // 20 − 8 inset − 1 border: follows the card's curve.
                        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                        .overlay(alignment: .bottomTrailing) {
                            Face(saver: saver, server: server, size: 20, ring: .clear)
                                .padding(2)
                                .background(GobShape().fill(Theme.surface))
                                .offset(x: 6, y: 6)
                        }
                    VStack(alignment: .leading, spacing: 1) {
                        Text("\(saver.displayName) just saved one")
                            .font(Theme.sans(14, .heavy))
                            .foregroundStyle(.white)
                        Text("up next")
                            .font(Theme.sans(14))
                            .foregroundStyle(Theme.inkSoft)
                    }
                    .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .padding(.leading, 8)
                .padding(.trailing, 14)
                .padding(.vertical, 8)
                .frame(width: 228)
                .background {
                    let shape = RoundedRectangle(cornerRadius: 20, style: .continuous)
                    shape.fill(.ultraThinMaterial).overlay(shape.fill(Theme.surface.opacity(0.85)))
                }
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(Face.colour(for: saver.username).opacity(0.5), lineWidth: 1))
                .shadow(color: .black.opacity(0.45), radius: 17, y: 14)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .offset(x: 22)
                .transition(.opacity.combined(with: .move(edge: .trailing)))
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.updatesFrequently)
            }
            if let note {
                HStack {
                    Text(note).font(Theme.sans(13, .bold)).foregroundStyle(Theme.warn)
                    if let retry { Button("Retry") { send(retry.say, to: retry.post) }.disabled(sending) }
                }
                .accessibilityElement(children: .contain)
                .accessibilityAddTraits(.updatesFrequently)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 24)
        .background(
            LinearGradient(colors: [.black.opacity(0.6), .clear], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea(edges: .top)
                .allowsHitTesting(false)
        )
    }

    /// "Ana and Ben · watching with you".
    private var watchersChip: some View {
        let others = model.others
        let names = SaverWords.names(SaverWords.ordered(others).map(\.displayName), upTo: 2)
        let unnamed = max(0, (model.moment.watching ?? 1) - 1 - others.count)
        return HStack(spacing: 9) {
            if !others.isEmpty {
                FaceStack(savers: others, server: server, size: 26, ring: Theme.watching)
            }
            // The names when they fit; the faces say who when they don't.
            ViewThatFits(in: .horizontal) {
                if others.isEmpty {
                    Text(unnamed > 0 ? "\(unnamed) watching with you" : "Just you so far")
                } else {
                    Text("\(names) · watching with you")
                    Text("watching with you")
                }
            }
            .font(Theme.sans(13, .semibold))
            .foregroundStyle(.white)
            .lineLimit(1)
        }
        .padding(.leading, others.isEmpty ? 14 : 6)
        .padding(.trailing, 14)
        .frame(height: 40)
        .frosted(Capsule(style: .continuous), dim: 0.55)
        .overlay(Capsule(style: .continuous).strokeBorder(.white.opacity(0.14), lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(others.isEmpty ? (unnamed > 0 ? "\(unnamed) watching with you" : "Just you watching so far")
                            : SaverWords.names(others.map(\.displayName), upTo: 2) + (others.count == 1 ? " is" : " are") + " watching with you")
        .accessibilityAddTraits(.updatesFrequently)
    }

    private func togglePicker() {
        picking.toggle()
        if picking { reactionPost = model.current?.ref }
        if !picking { typing = false }
        note = nil
    }

    /// You, for your own reactions' faces.
    private var you: Saver {
        // Always your current picture: the room's copy of you may not have it.
        YourFace.shared.you(from: model.watchers.first(where: \.isYou))
    }

    /// Six quick emoji, and a few words to everyone watching.
    private var picker: some View {
        ReactPicker(words: $words, typing: $typing, sending: sending, retrying: retry != nil, note: note,
                    prompt: "Say something to everyone watching",
                    hint: "Up to \(LiveSay.maxText) characters, to everyone watching",
                    onEmoji: { send(.emoji($0)) }, onWords: sendWords)
    }

    private func sendWords() {
        let text = words.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        send(.text(text))
    }

    private func send(_ say: LiveSay, to target: PostRef? = nil) {
        guard !sending, let post = target ?? reactionPost ?? model.current?.ref else { return }
        sending = true
        note = nil
        Task {
            let sent = await model.react(say, you: you, to: post)
            sending = false
            if sent {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                if case .text(let text) = say, words.trimmingCharacters(in: .whitespacesAndNewlines) == text { words = "" }
                retry = nil
                typing = false
                picking = false
            } else {
                retry = (say, post)
                if case .text = say { note = "Not sent. Your words are still here. Tap Retry."; picking = true }
                else { note = "Not sent. Tap Retry." }
                UIAccessibility.post(notification: .announcement, argument: note)
            }
        }
    }

}
