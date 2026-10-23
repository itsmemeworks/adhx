import SwiftUI

/// "Pick up where you left off?" over a long post you left part-way (board 14.2).
struct ResumeCard: View {
    let spot: ResumeStore.Spot
    let resume: () -> Void
    let startOver: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Pick up where you left off?")
                .font(Theme.serif(30))
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text("You were \(ResumeStore.clock(spot.seconds)) into this, \(ResumeStore.when(spot.at)).")
                .font(Theme.sans(14))
                .foregroundStyle(Theme.inkSoft)
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule(style: .continuous).fill(.white.opacity(0.18))
                    Capsule(style: .continuous).fill(Theme.accent)
                        .frame(width: proxy.size.width * min(1, spot.seconds / max(spot.duration, spot.seconds, 1)))
                }
            }
            .frame(height: 4)
            .accessibilityHidden(true)
            // 24 − 20 inset − 1 border is under 8, so 8: follows the card's curve.
            HStack(spacing: 10) {
                Button("Resume from \(ResumeStore.clock(spot.seconds))", action: resume)
                    .buttonStyle(PillButtonStyle(kind: .primary, height: 48, cornerRadius: 8))
                Button("Start over", action: startOver)
                    .buttonStyle(PillButtonStyle(kind: .outline, height: 48, fullWidth: false, cornerRadius: 8))
            }
        }
        .padding(20)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Theme.surface.opacity(0.92)))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(.white.opacity(0.1), lineWidth: 1))
        .padding(.horizontal, 24)
    }
}
