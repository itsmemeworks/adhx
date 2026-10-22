import SwiftUI

/// A soft light that sweeps across a placeholder while something is on its way.
/// Still with Reduce Motion.
struct Shimmer: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: CGFloat = -1

    func body(content: Content) -> some View {
        content
            .overlay {
                if !reduceMotion {
                    GeometryReader { proxy in
                        LinearGradient(
                            colors: [.clear, .white.opacity(0.14), .clear],
                            startPoint: .leading, endPoint: .trailing
                        )
                        .frame(width: proxy.size.width * 0.6)
                        .offset(x: phase * proxy.size.width * 1.4)
                    }
                    .allowsHitTesting(false)
                }
            }
            .clipped()
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: false)) { phase = 1 }
            }
    }
}

extension View {
    func shimmer() -> some View { modifier(Shimmer()) }
}

/// A post whose copy is still being made on your ADHX: a breathing, shimmering
/// poster with how far along it is.
struct PreparingCard: View {
    var percent: Int?
    var converting = false
    var compact = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var breathe = false

    var body: some View {
        VStack(spacing: compact ? 12 : 18) {
            ZStack {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Theme.surface)
                    .shimmer()
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                ProgressRing(fraction: percent.map { Double($0) / 100 }, size: compact ? 40 : 56)
            }
            .frame(width: compact ? 120 : 180, height: compact ? 160 : 240)
            .scaleEffect(breathe ? 1.02 : 0.98)
            .opacity(breathe ? 1 : 0.85)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) { breathe = true }
            }
            VStack(spacing: 6) {
                Text("Getting it ready…")
                    .font(Theme.sans(compact ? 16 : 18, .heavy))
                    .foregroundStyle(.white)
                Text(detail)
                    .font(Theme.sans(14))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    // Clear of the player's buttons down the right.
                    .frame(maxWidth: 230)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var detail: String {
        if converting { return "Making it play everywhere. It'll be here in a moment." }
        if let percent, percent > 0 { return "Keeping a copy · \(percent)%" }
        return "Your ADHX is keeping a copy. It'll be here in a moment."
    }
}

/// A ring that fills with progress, or spins when there's no number yet.
struct ProgressRing: View {
    var fraction: Double?
    var size: CGFloat = 56

    var body: some View {
        ZStack {
            Circle().stroke(Theme.raised, lineWidth: 4)
            if let fraction {
                Circle()
                    .trim(from: 0, to: max(0.03, min(1, fraction)))
                    .stroke(Theme.accent, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.easeOut(duration: 0.4), value: fraction)
            } else {
                RingSpinner(size: size, lineWidth: 4, track: .clear)
            }
        }
        .frame(width: size, height: size)
    }
}

/// "2 on their way": saves still being kept, above the player.
struct PreparingPill: View {
    let count: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(Theme.accent)
                .frame(width: 8, height: 8)
                .scaleEffect(pulse ? 1.3 : 0.7)
                .opacity(pulse ? 1 : 0.5)
            Text(count == 1 ? "1 on its way" : "\(count) on their way")
                .font(Theme.sans(13, .heavy))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 34)
        .background(Capsule().fill(.ultraThinMaterial))
        .overlay(Capsule().strokeBorder(.white.opacity(0.12), lineWidth: 1))
        .shimmer()
        .clipShape(Capsule())
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { pulse = true }
        }
        .accessibilityLabel(count == 1 ? "1 save on its way" : "\(count) saves on their way")
    }
}

/// Over a video that isn't playing yet: when its copy is still being made on
/// your ADHX, say so and show the progress; play it as soon as it's kept.
struct PreparingOverlay: View {
    let post: PhonePost
    @ObservedObject var playback: Playback
    /// Play the next post (nil when there's none).
    var next: (() -> Void)? = nil
    /// Your save of it was removed.
    var removed: () -> Void = {}
    @State private var status: StatusResult?
    @State private var retriedKept = false
    private var preparing: Bool {
        guard let s = status?.status else { return false }
        return ["waiting", "keeping", "retrying"].contains(s)
    }

    var body: some View {
        Group {
            if preparing {
                PreparingCard(percent: status?.percent, converting: status?.step == "converting")
                    .transition(.opacity.combined(with: .scale(scale: 0.96)))
            } else if let trouble = playback.trouble {
                CantPlayCard(post: post, trouble: trouble, words: playback.problem,
                             next: next, retry: playback.retry, removed: removed)
                    .id(post.key)
                    // Above the rail of buttons on the right.
                    .padding(.bottom, 240)
            } else if !playback.ready {
                RingSpinner().frame(width: 34, height: 34)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: preparing)
        .task(id: post.key) {
            status = nil
            retriedKept = false
            await follow()
        }
        .task(id: PlaybackWait(post: post.key, attempt: playback.loadAttempt, preparing: preparing)) {
            // Preparation suspends the deadline; retry or finishing preparation
            // starts a full new wait, even though the post's key is unchanged.
            await PlaybackWait(post: post.key, attempt: playback.loadAttempt, preparing: preparing)
                .run { playback.gaveUpWaiting() }
        }
    }

    /// Ask how the copy is coming along every 2 s while it isn't playing.
    private func follow() async {
        guard let client = Store.client() else { return }
        while !Task.isCancelled {
            if playback.ready { return }
            if let s = try? await client.status(platform: post.platform, id: post.postId) {
                guard !Task.isCancelled else { return }
                let was = preparing
                status = s
                // The first kept response can race the old AVPlayerItem's
                // failure notification. Reload once, even if it hasn't arrived.
                if s.status == "kept" && !retriedKept {
                    retriedKept = true
                    status = nil
                    playback.retry()
                    continue
                }
                if KeepStatus.final.contains(s.status) && !was { return }
            }
            try? await Task.sleep(nanoseconds: 2_000_000_000)
        }
    }
}

/// A post that can't play says why, and never just sits there (boards 14.8,
/// 14.9). Gone from its network: where and why, then the next one after 3 s.
/// Can't load: it's the connection, Try again or Skip.
struct CantPlayCard: View {
    let post: PhonePost
    let trouble: Playback.Trouble
    /// The server's words, when it said why.
    let words: String?
    let next: (() -> Void)?
    let retry: () -> Void
    let removed: () -> Void
    @ObservedObject private var privacy = PrivacyStore.shared
    @State private var countdown = 3
    @State private var removing = false
    @State private var removeError: String?
    /// Your save of it has gone.
    @State private var gone = false

    private var network: String { Network.name(post.platform) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(trouble == .gone ? "Can’t play this one here" : "Couldn’t load this one")
                .font(Theme.serif(30))
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(message)
                .font(Theme.sans(15))
                .foregroundStyle(Theme.cream)
                .fixedSize(horizontal: false, vertical: true)
            if trouble == .gone, let source = post.sourceUrl.flatMap(URL.init(string:)) {
                Button("Open on \(network)") { openURL(source) }
                    .font(Theme.sans(15, .heavy))
                    .foregroundStyle(Theme.accent)
                    .buttonStyle(.plain)
            }
            if trouble == .gone, next != nil, countdown > 0 {
                HStack(spacing: 10) {
                    ProgressRing(fraction: Double(3 - countdown) / 3, size: 28)
                    Text("Playing the next one in \(countdown)")
                        .font(Theme.sans(14))
                        .foregroundStyle(Theme.muted)
                        .accessibilityAddTraits(.updatesFrequently)
                }
            }
            if let removeError {
                Text(removeError).font(Theme.sans(13)).foregroundStyle(Theme.warn)
            }
            if gone {
                Label("Removed from your saves", systemImage: "checkmark")
                    .font(Theme.sans(14, .bold))
                    .foregroundStyle(Theme.good)
            }
            buttons
        }
        .padding(20)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Theme.surface.opacity(0.92)))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(.white.opacity(0.1), lineWidth: 1))
        .padding(.horizontal, 16)
        .accessibilityElement(children: .contain)
        .task {
            // Gone: move on by itself, unless something here is being done.
            guard trouble == .gone, let next else { return }
            while countdown > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard !Task.isCancelled, !removing else { return }
                countdown -= 1
            }
            next()
        }
    }

    private var message: String {
        switch trouble {
        case .gone:
            // The server's words, unless they're the generic ones.
            if let words, !words.isEmpty, !words.hasPrefix("This video couldn"),
               !words.hasPrefix("This one couldn’t be downloaded yet") { return words }
            return "It was taken down or made private on \(network) before your ADHX could keep a copy."
        case .cantLoad:
            return "Your ADHX didn’t answer in time. It’s still saved; this is just the connection."
        }
    }

    @Environment(\.openURL) private var openURL

    /// One row, always (board 14.8).
    private var buttons: some View {
        HStack(spacing: 8) { buttonList }
    }

    @ViewBuilder
    private var buttonList: some View {
            switch trouble {
            case .gone:
                if let next {
                    Button("Next now", action: next)
                        .buttonStyle(PillButtonStyle(kind: .primary, height: 44, fullWidth: false, fontSize: 14))
                }
                if privacy.isSaved(post), !gone {
                    Button(removing ? "Removing…" : "Remove from my saves") { Task { await remove() } }
                        .buttonStyle(PillButtonStyle(kind: .outline, height: 44, fullWidth: false, fontSize: 14))
                        .disabled(removing)
                }
            case .cantLoad:
                Button("Try again", action: retry)
                    .buttonStyle(PillButtonStyle(kind: .primary, height: 48, fullWidth: false))
                if let next {
                    Button("Skip it", action: next)
                        .buttonStyle(PillButtonStyle(kind: .outline, height: 48, fullWidth: false))
                }
            }
    }

    private func done() {
        removing = false
        gone = true
        removed()
        next?()
    }

    private func remove() async {
        guard let client = Store.client() else { return }
        removing = true
        removeError = nil
        do {
            try await client.removeSave(platform: post.platform, id: post.postId)
            done()
        } catch let error as APIError where error.code == "not_saved" {
            done()
        } catch {
            removing = false
            removeError = "Couldn’t remove it just now. Try again."
        }
    }
}
