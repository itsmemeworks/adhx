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
    @State private var status: StatusResult?

    private var preparing: Bool {
        guard let s = status?.status else { return false }
        return ["waiting", "keeping", "retrying"].contains(s)
    }

    var body: some View {
        Group {
            if preparing {
                PreparingCard(percent: status?.percent, converting: status?.step == "converting")
                    .transition(.opacity.combined(with: .scale(scale: 0.96)))
            } else if let problem = playback.problem {
                Text(problem)
                    .font(Theme.sans(15))
                    .foregroundStyle(Theme.cream)
                    .multilineTextAlignment(.center)
                    .padding(16)
                    .background(RoundedRectangle(cornerRadius: 14).fill(.black.opacity(0.7)))
                    .padding(32)
            } else if !playback.ready {
                RingSpinner().frame(width: 34, height: 34)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: preparing)
        .task(id: post.key) { await follow() }
    }

    /// Ask how the copy is coming along every 2 s while it isn't playing.
    private func follow() async {
        guard let client = Store.client() else { return }
        while !Task.isCancelled {
            if playback.ready { return }
            if let s = try? await client.status(platform: post.platform, id: post.postId) {
                let was = preparing
                status = s
                if was && s.status == "kept" {
                    status = nil
                    playback.retry()
                }
                if KeepStatus.final.contains(s.status) && !was { return }
            }
            try? await Task.sleep(nanoseconds: 2_000_000_000)
        }
    }
}
