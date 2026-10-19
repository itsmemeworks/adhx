import SwiftUI
import UIKit

/// Colours and type from docs/specs/phone-app.md.
enum Theme {
    static let app = Color(hex: 0x0F0E0C)
    static let behind = Color.black
    static let surface = Color(hex: 0x1A1814)
    static let raised = Color(hex: 0x2A2620)
    static let placeholder = Color(hex: 0x2A2825)
    static let hairline = Color(hex: 0x4A453C)
    static let accent = Color(hex: 0xFFD23F)
    static let cream = Color(hex: 0xF2EAD9)
    static let muted = Color(hex: 0xC9BFAB)
    static let faint = Color(hex: 0xA89F8D)
    static let good = Color(hex: 0x7DDC8A)
    static let warn = Color(hex: 0xFFB59A)
    /// The red dot on Live.
    static let live = Color(hex: 0xFF5A3C)

    /// A colour the server sends as "#rrggbb" (a moment's hue), if it reads.
    static func hue(_ text: String?) -> Color? {
        guard var hex = text?.trimmingCharacters(in: .whitespaces), !hex.isEmpty else { return nil }
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard hex.count == 6, let value = UInt32(hex, radix: 16) else { return nil }
        return Color(hex: value)
    }

    /// Instrument Serif when it's bundled (see README), else the system serif.
    static func serif(_ size: CGFloat) -> Font {
        if UIFont(name: "InstrumentSerif-Regular", size: size) != nil {
            return .custom("InstrumentSerif-Regular", size: size)
        }
        return .system(size: size, weight: .regular, design: .serif)
    }

    static func sans(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight)
    }
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: opacity)
    }
}

/// Gob, the ADHX mark (src/components/next/Gob.tsx): a yellow body tilted −4°,
/// eyes that never match and a mouth tilted −7°, on a 96×96 grid.
/// `busy` gives a worried "o" mouth and a gentle bob (none under Reduce Motion).
struct Gob: View {
    enum Mood { case idle, busy }

    var size: CGFloat = 30
    var mood: Mood = .idle
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var bobUp = false

    private static let ink = Color(hex: 0x141414)

    var body: some View {
        Canvas { context, canvasSize in
            context.scaleBy(x: canvasSize.width / 96, y: canvasSize.height / 96)
            context.rotate(-4, around: CGPoint(x: 48, y: 50))

            context.fill(Path(roundedRect: CGRect(x: 10, y: 14, width: 76, height: 72), cornerRadius: 28),
                         with: .color(Theme.accent))
            context.fill(Path(ellipseIn: Self.circle(36, 46, 7)), with: .color(Self.ink))
            context.fill(Path(ellipseIn: Self.circle(63, 42, 11)), with: .color(Self.ink))
            context.fill(Path(ellipseIn: Self.circle(66, 39, 3.5)), with: .color(Theme.accent))

            if mood == .busy {
                context.fill(Path(ellipseIn: Self.circle(49, 69, 5)), with: .color(Self.ink))
            } else {
                var mouth = context
                mouth.rotate(-7, around: CGPoint(x: 49, y: 67.5))
                mouth.fill(Path(roundedRect: CGRect(x: 36, y: 64, width: 26, height: 7), cornerRadius: 3.5),
                           with: .color(Self.ink))
            }
        }
        .frame(width: size, height: size)
        .offset(y: mood == .busy && bobUp ? -size * 0.06 : 0)
        .onAppear { startBobbing() }
        .onChange(of: mood) { _, _ in startBobbing() }
        .accessibilityHidden(true)
    }

    private func startBobbing() {
        guard mood == .busy, !reduceMotion else {
            bobUp = false
            return
        }
        withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) { bobUp = true }
    }

    private static func circle(_ cx: CGFloat, _ cy: CGFloat, _ r: CGFloat) -> CGRect {
        CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2)
    }
}

private extension GraphicsContext {
    /// Rotates by degrees around a point, like SVG's rotate(a x y).
    mutating func rotate(_ degrees: Double, around p: CGPoint) {
        translateBy(x: p.x, y: p.y)
        rotate(by: .degrees(degrees))
        translateBy(x: -p.x, y: -p.y)
    }
}

/// Gob plus the "adhx" wordmark in the serif.
struct Wordmark: View {
    var markSize: CGFloat = 30
    var textSize: CGFloat = 26
    var mood: Gob.Mood = .idle

    var body: some View {
        HStack(spacing: 10) {
            Gob(size: markSize, mood: mood)
            Text("adhx")
                .font(Theme.serif(textSize))
                .foregroundStyle(.white)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("ADHX")
    }
}

/// The small ring spinner from the designs: hairline ring, yellow quarter.
struct RingSpinner: View {
    var size: CGFloat = 14
    var lineWidth: CGFloat = 2
    var track: Color = Theme.hairline
    @State private var spinning = false

    var body: some View {
        ZStack {
            Circle().stroke(track, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: 0.25)
                .stroke(Theme.accent, style: StrokeStyle(lineWidth: lineWidth, lineCap: .butt))
                .rotationEffect(.degrees(spinning ? 360 - 45 : -45))
        }
        .frame(width: size - lineWidth, height: size - lineWidth)
        .frame(width: size, height: size)
        .onAppear {
            withAnimation(.linear(duration: 0.9).repeatForever(autoreverses: false)) {
                spinning = true
            }
        }
        .accessibilityHidden(true)
    }
}

/// Rounded pill buttons: yellow filled, or cream outline.
struct PillButtonStyle: ButtonStyle {
    enum Kind { case primary, outline, warn }
    var kind: Kind = .primary
    var height: CGFloat = 52
    var fullWidth = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.sans(15, .heavy))
            .lineLimit(1)
            .padding(.horizontal, 20)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: height)
            .foregroundStyle(foreground)
            .background(Capsule().fill(kind == .primary ? Theme.accent : Color.clear))
            .overlay(Capsule().strokeBorder(border, lineWidth: 1.5))
            .contentShape(Capsule())
            .opacity(configuration.isPressed ? 0.7 : 1)
    }

    private var foreground: Color {
        switch kind {
        case .primary: return .black
        case .outline: return Theme.cream
        case .warn: return Theme.warn
        }
    }

    private var border: Color {
        switch kind {
        case .primary: return .clear
        case .outline: return Theme.cream
        case .warn: return Theme.warn
        }
    }
}

/// The round 44pt close button on sheets.
struct CloseButton: View {
    var label = "Close"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Theme.raised))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
