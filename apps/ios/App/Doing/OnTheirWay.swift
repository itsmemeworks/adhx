import SwiftUI

// "On their way" (docs/specs/phone-app.md → On their way): a pill on the
// player while posts are being kept and learned, a sheet with each one's
// step, and the full "What your ADHX is doing" list.

/// "3 on their way" over the player. Tapping it opens the sheet.
struct OnTheirWayPill: View {
    let moving: Int
    let needsYou: Int

    var body: some View {
        HStack(spacing: 8) {
            if moving > 0 {
                RingSpinner(size: 14, lineWidth: 2.5)
            } else {
                Circle().fill(Theme.live).frame(width: 8, height: 8)
            }
            Text(label)
                .font(Theme.sans(13, .heavy))
                .foregroundStyle(.white)
                .lineLimit(1)
        }
        .padding(.leading, 10)
        .padding(.trailing, 14)
        .frame(minHeight: 34)
        .background(Capsule(style: .continuous).fill(.black.opacity(0.6)))
        .overlay(Capsule(style: .continuous).strokeBorder(moving > 0 ? Theme.accent : Theme.live.opacity(0.8), lineWidth: 1.5))
        .padding(.vertical, 5)
        .contentShape(Capsule(style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
        .accessibilityHint("Shows what your ADHX is doing")
        .accessibilityAddTraits(.isButton)
    }

    private var label: String {
        if moving > 0 { return moving == 1 ? "1 on its way" : "\(moving) on their way" }
        return needsYou == 1 ? "1 needs you" : "\(needsYou) need you"
    }

    private var spoken: String {
        var parts: [String] = []
        if moving > 0 { parts.append(moving == 1 ? "1 save on its way" : "\(moving) saves on their way") }
        if needsYou > 0 { parts.append(needsYou == 1 ? "1 needs you" : "\(needsYou) need you") }
        return parts.joined(separator: ", ")
    }
}

/// The sheet from the pill: what's on its way, step by step, with Retry for
/// the ones that need you.
struct OnTheirWaySheet: View {
    @ObservedObject var doing: DoingModel
    let server: URL
    /// Opens the full list (the sheet closes first).
    let seeAll: () -> Void
    private static let shown = 6

    var body: some View {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(title)
                            .font(Theme.serif(32))
                            .foregroundStyle(.white)
                            .accessibilityAddTraits(.isHeader)
                        Spacer(minLength: 8)
                        if doing.moving > 0 && doing.needsYou > 0 {
                            Text(doing.needsYou == 1 ? "1 needs you" : "\(doing.needsYou) need you")
                                .font(Theme.sans(13))
                                .foregroundStyle(Theme.faint)
                        }
                    }
                    if doing.active.isEmpty {
                        Text(doing.loadedOnce ? "Everything’s landed. Nothing on its way right now." : "Asking your ADHX…")
                            .font(Theme.sans(15))
                            .foregroundStyle(Theme.muted)
                            .padding(.vertical, 8)
                    } else {
                        VStack(spacing: 10) {
                            ForEach(shownRows) { item in
                                DoingRow(item: item, server: server, doing: doing)
                            }
                        }
                        if doing.active.count > Self.shown {
                            Text("And \(doing.active.count - Self.shown) more")
                                .font(Theme.sans(13))
                                .foregroundStyle(Theme.faint)
                        }
                    }
                    Button("See everything your ADHX is doing", action: seeAll)
                    .buttonStyle(PillButtonStyle(kind: .outline, height: 48))
                    .padding(.top, 2)
                    Text("All on your server. Nothing sent anywhere.")
                        .font(Theme.sans(12))
                        .foregroundStyle(Theme.faint)
                        .frame(maxWidth: .infinity)
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 24)
        .onAppear { doing.watch("sheet") }
        .onDisappear { doing.unwatch("sheet") }
    }

    /// What's moving first, then what needs you (the boards' order), always
    /// keeping the ones that need you in view.
    private var shownRows: [DoingItem] {
        let needs = doing.active.filter(\.needsYou)
        let moving = doing.active.filter { !$0.needsYou }
        return Array(moving.prefix(max(Self.shown - needs.count, 0))) + needs.prefix(Self.shown)
    }

    private var title: String {
        if doing.moving > 0 { return doing.moving == 1 ? "1 on its way" : "\(doing.moving) on their way" }
        if doing.needsYou > 0 { return doing.needsYou == 1 ? "1 needs you" : "\(doing.needsYou) need you" }
        return "All done"
    }
}

/// One post: its picture, title, step and a thin bar; "needs you" ones say
/// why in plain words and offer Retry (to people who saved it).
struct DoingRow: View {
    let item: DoingItem
    let server: URL
    @ObservedObject var doing: DoingModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                thumbnail
                VStack(alignment: .leading, spacing: 6) {
                    Text(item.needsYou ? (item.reason ?? item.title) : item.title)
                        .font(Theme.sans(14, .heavy))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    if !item.needsYou && !item.isReady {
                        ThinBar(fraction: fraction, colour: item.playable ? Theme.good : Theme.accent)
                    }
                    Text(detail)
                        .font(Theme.sans(12))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
                if item.needsYou || item.status == "waiting", item.retry {
                    Button {
                        Task { await doing.retry(item) }
                    } label: {
                        if doing.retrying.contains(item.id) {
                            ProgressView().tint(.black)
                        } else {
                            Text("Retry")
                        }
                    }
                    .font(Theme.sans(14, .heavy))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 16)
                    .frame(minWidth: 72, minHeight: 40)
                    // 18 − 10 inset: follows the row's curve.
                    .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Theme.cream))
                    .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .buttonStyle(.plain)
                    .disabled(doing.retrying.contains(item.id))
                    .accessibilityLabel("Retry \(item.title)")
                }
            }
            if let error = doing.retryErrors[item.id] {
                Text(error)
                    .font(Theme.sans(12, .bold))
                    .foregroundStyle(Theme.warn)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.plate))
        .overlay {
            if item.needsYou {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Theme.live.opacity(0.5), lineWidth: 1)
            }
        }
    }

    @ViewBuilder
    private var thumbnail: some View {
        let url = ADHXClient.resolve(item.thumbnail, against: server)
        Group {
            if item.needsYou {
                // What needs you shows why, not the picture (it often can't load).
                Image(systemName: item.reason?.localizedCaseInsensitiveContains("private") == true
                      ? "lock" : "exclamationmark.triangle")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Theme.live)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Theme.surface)
            } else {
                AuthImage(url: url) {
                    Theme.placeholder.overlay(
                        Image(systemName: "photo")
                            .font(.system(size: 16))
                            .foregroundStyle(Theme.faint))
                }
            }
        }
        .frame(width: 48, height: 48)
        // 18 − 10 inset: follows the row's curve.
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .accessibilityHidden(true)
    }

    /// How far along: the step's own percent when there is one, else the step.
    private var fraction: Double {
        if let percent = item.percent { return Double(percent) / 100 }
        return Double(max(0, item.step - 1)) / Double(max(1, item.steps - 1))
    }

    /// Whose save it is, when it isn't yours: "Jo", "Mum’s save".
    private var whose: String? {
        guard !item.savers.contains(where: \.isYou), let first = item.savers.first else { return nil }
        return first.displayName
    }

    private var detail: String {
        var parts: [String] = []
        if item.needsYou {
            parts.append(item.step <= 3 ? "Couldn’t keep it" : "Couldn’t learn what’s in it")
            if let whose { parts.append("\(whose)’s save") }
            if !item.retry, let whose { parts.append("only \(whose) can retry") }
            return parts.joined(separator: " · ")
        }
        if item.isReady {
            parts.append("Ready")
            if let quality = item.quality { parts.append(quality) }
            if !item.learned.isEmpty { parts.append("learned " + SaverWords.names(item.learned, upTo: 5)) }
            return parts.joined(separator: " · ")
        }
        if item.playable {
            parts.append("Plays now")
            parts.append(item.stepLabel.lowercasedFirst)
        } else {
            parts.append(item.stepLabel)
        }
        if let percent = item.percent, item.status == "working" { parts.append("\(percent)%") }
        if item.status == "waiting", let reason = item.reason { parts.append(reason) }
        if let whose { parts.append(whose) }
        return parts.joined(separator: " · ")
    }
}

/// A thin progress line.
private struct ThinBar: View {
    let fraction: Double
    let colour: Color

    var body: some View {
        GeometryReader { box in
            ZStack(alignment: .leading) {
                Capsule(style: .continuous).fill(Theme.hairline)
                Capsule(style: .continuous).fill(colour)
                    .frame(width: max(4, box.size.width * min(1, max(0, fraction))))
                    .animation(.easeOut(duration: 0.4), value: fraction)
            }
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }
}

private extension String {
    /// "Listening to what’s said" → "listening to what’s said".
    var lowercasedFirst: String {
        guard let first else { return self }
        return first.lowercased() + dropFirst()
    }
}

// MARK: - The full list

/// Everything your ADHX is doing: what needs you, what's on its way and
/// what finished in the last half hour.
struct DoingScreen: View {
    @ObservedObject var doing: DoingModel
    let server: URL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                RoundBackButton()
                Text("What your ADHX is doing")
                    .font(Theme.serif(36))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if let line = summaryLine {
                    Text(line)
                        .font(Theme.sans(14))
                        .foregroundStyle(Theme.muted)
                }
                if doing.summary.processing == "remote", doing.summary.remoteConnected == false {
                    note("The Mac helper isn’t connected, so learning and converting wait for it.")
                }
                if doing.unsupported {
                    note("Your ADHX needs an update to show this.")
                } else if let error = doing.loadError, doing.items.isEmpty {
                    note(error)
                } else if !doing.loadedOnce {
                    HStack { Spacer(); RingSpinner(size: 34, lineWidth: 3); Spacer() }
                        .padding(.top, 30)
                } else if doing.items.isEmpty {
                    Text("Nothing on the go. Everything you and your people saved is ready.")
                        .font(Theme.sans(15))
                        .foregroundStyle(Theme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                section("Needs you", doing.items.filter(\.needsYou))
                section("On their way", doing.items.filter { !$0.needsYou && !$0.isReady })
                section("Done lately", doing.items.filter(\.isReady))
                if let free = doing.summary.freeBytes {
                    Text("\(ByteCountFormatter.string(fromByteCount: Int64(free), countStyle: .file)) free on your ADHX")
                        .font(Theme.sans(12))
                        .foregroundStyle(Theme.faint)
                }
                Text("All on your server. Nothing sent anywhere.")
                    .font(Theme.sans(12))
                    .foregroundStyle(Theme.faint)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 24)
        }
        .refreshable { await doing.refresh() }
        .background(Theme.app.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { doing.watch("list") }
        .onDisappear { doing.unwatch("list") }
    }

    private var summaryLine: String? {
        var parts: [String] = []
        if let line = doing.line { parts.append(line) }
        if doing.summary.ready > 0 { parts.append("\(doing.summary.ready) done lately") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    @ViewBuilder
    private func section(_ title: String, _ items: [DoingItem]) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text(title.uppercased())
                    .font(Theme.sans(12, .heavy))
                    .tracking(0.8)
                    .foregroundStyle(title == "Needs you" ? Theme.live : Theme.faint)
                    .accessibilityAddTraits(.isHeader)
                ForEach(items) { item in
                    DoingRow(item: item, server: server, doing: doing)
                }
            }
            .padding(.top, 4)
        }
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(Theme.sans(14))
            .foregroundStyle(Theme.cream)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.surface))
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The round back button at the top of pushed screens.
struct RoundBackButton: View {
    var label = "Back"
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Button {
            dismiss()
        } label: {
            Image(systemName: "chevron.left")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Theme.surface))
        }
        .accessibilityLabel(label)
    }
}
