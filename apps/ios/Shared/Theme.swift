import CoreText
import SwiftUI
import UIKit

/// Colours and type from docs/specs/phone-app.md.
enum Theme {
    static let app = Color(hex: 0x0F0E0C)
    static let behind = Color.black
    static let surface = Color(hex: 0x1A1814)
    static let raised = Color(hex: 0x2A2620)
    /// The boards' quiet buttons and round icon plates (#262320).
    static let plate = Color(hex: 0x262320)
    /// The boards' white text on dark (#f4f1ea).
    static let ink = Color(hex: 0xF4F1EA)
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

    /// Instrument Serif (bundled in `Shared/Fonts`), else the system serif.
    static func serif(_ size: CGFloat) -> Font {
        BundledFonts.register()
        if UIFont(name: "InstrumentSerif-Regular", size: size) != nil {
            return .custom("InstrumentSerif-Regular", size: size)
        }
        return .system(size: size, weight: .regular, design: .serif)
    }

    /// Hanken Grotesk (bundled, one variable file), else the system sans.
    static func sans(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        if let font = BundledFonts.hanken(size, weight) { return Font(font) }
        return .system(size: size, weight: weight)
    }
}

/// The designs' two families, OFL, in `Shared/Fonts`. Registered for this
/// process on first use (the variable Hanken Grotesk is a .woff2, which
/// CoreText reads but `UIAppFonts` doesn't promise to).
enum BundledFonts {
    private static let registered: Bool = {
        let bundle = Bundle.main
        let urls = ["InstrumentSerif-Regular.ttf", "HankenGrotesk-latin-variable.woff2"].compactMap { name -> URL? in
            let parts = name.split(separator: ".", maxSplits: 1).map(String.init)
            return bundle.url(forResource: parts[0], withExtension: parts[1])
                ?? bundle.url(forResource: parts[0], withExtension: parts[1], subdirectory: "Fonts")
        }
        for url in urls { CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil) }
        return !urls.isEmpty
    }()

    static func register() { _ = registered }

    private static var cache: [String: UIFont] = [:]
    private static let lock = NSLock()
    /// 'wght'
    private static let weightAxis = 0x7767_6874

    static func hanken(_ size: CGFloat, _ weight: Font.Weight) -> UIFont? {
        register()
        let value = weightValue(weight)
        let key = "\(size)-\(value)"
        lock.lock()
        defer { lock.unlock() }
        if let font = cache[key] { return font }
        let descriptor = UIFontDescriptor(fontAttributes: [
            .family: "Hanken Grotesk",
            UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [weightAxis: value],
        ])
        let font = UIFont(descriptor: descriptor, size: size)
        guard font.familyName == "Hanken Grotesk" else { return nil }
        cache[key] = font
        return font
    }

    private static func weightValue(_ weight: Font.Weight) -> Int {
        switch weight {
        case .ultraLight: return 200
        case .thin: return 100
        case .light: return 300
        case .medium: return 500
        case .semibold: return 600
        case .bold: return 700
        case .heavy: return 800
        case .black: return 900
        default: return 400
        }
    }
}

extension View {
    /// The boards' serif headings that wrap (`line-height: 0.95`): lines that
    /// nearly touch. Text can only tighten its leading from iOS 26; earlier it
    /// keeps the font's own.
    /// The API is in the iOS 26 SDK (Swift 6.2, Xcode 26); an older Xcode
    /// builds the fallback.
    @ViewBuilder
    func tightLines(_ size: CGFloat, factor: CGFloat = 0.95) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            // An exact line height keeps the font's full ascent above the first
            // line, where CSS splits the cut between top and bottom: move the
            // glyphs back to where the boards put them (measured at 34 pt).
            lineHeight(.exact(points: size * factor))
                .padding(.top, -size * 0.29)
                .padding(.bottom, size * 0.15)
        } else {
            self
        }
        #else
        self
        #endif
    }

    /// The boards' frosted glass: a blur of what's behind, darkened
    /// (`background: rgba(0,0,0,dim); backdrop-filter: blur(12px)`).
    func frosted<S: Shape>(_ shape: S, dim: Double = 0.45) -> some View {
        background {
            shape.fill(.ultraThinMaterial)
                .overlay(shape.fill(Color.black.opacity(dim)))
                .environment(\.colorScheme, .dark)
        }
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
    enum Mood { case idle, busy, happy }

    var size: CGFloat = 30
    var mood: Mood = .idle
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var bobUp = false

    private static let ink = Color(hex: 0x141414)

    var body: some View {
        Canvas { context, canvasSize in
            if mood == .happy {
                Self.drawHappy(&context, canvasSize)
                return
            }
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

    /// Grinning, eyes squeezed shut (the "connected" board), on a 40×40 grid tilted −7°.
    private static func drawHappy(_ context: inout GraphicsContext, _ size: CGSize) {
        context.scaleBy(x: size.width / 40, y: size.height / 40)
        context.rotate(-7, around: CGPoint(x: 20, y: 20))
        context.fill(Path(roundedRect: CGRect(x: 3, y: 3, width: 34, height: 34), cornerRadius: 14),
                     with: .color(Theme.accent))
        func arc(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ rise: CGFloat, _ line: CGFloat) {
            var path = Path()
            path.move(to: CGPoint(x: x, y: y))
            path.addQuadCurve(to: CGPoint(x: x + w, y: y), control: CGPoint(x: x + w / 2, y: y - rise))
            context.stroke(path, with: .color(ink), style: StrokeStyle(lineWidth: line, lineCap: .round))
        }
        // The board's own quadratic control points (`q3 -4 6 0`, `q4.5 -6 9 0`, `q6.5 6 13 -0.5`).
        arc(10.5, 17.5, 6, 4, 2.4)
        arc(21.5, 17, 9, 6, 2.6)
        var mouth = Path()
        mouth.move(to: CGPoint(x: 13.5, y: 25))
        mouth.addQuadCurve(to: CGPoint(x: 26.5, y: 24.5), control: CGPoint(x: 20, y: 31))
        mouth.closeSubpath()
        context.fill(mouth, with: .color(ink))
        context.stroke(mouth, with: .color(ink), style: StrokeStyle(lineWidth: 2.4, lineCap: .round, lineJoin: .round))
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

/// Rounded pill buttons, as on the boards: yellow filled (16/800), a quiet
/// hairline outline, or a raised plate (15/600).
struct PillButtonStyle: ButtonStyle {
    enum Kind { case primary, outline, raised, warn }
    var kind: Kind = .primary
    var height: CGFloat = 52
    var fullWidth = true
    /// Overrides the kind's own size.
    var fontSize: CGFloat?

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.sans(fontSize ?? (kind == .primary ? 16 : 15), kind == .primary ? .heavy : .semibold))
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .padding(.horizontal, 20)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: height)
            .foregroundStyle(foreground)
            .background(Capsule().fill(fill))
            .overlay(Capsule().strokeBorder(border, lineWidth: 1))
            .contentShape(Capsule())
            .opacity(configuration.isPressed ? 0.7 : 1)
    }

    private var fill: Color {
        switch kind {
        case .primary: return Theme.accent
        case .raised: return Theme.plate
        case .outline, .warn: return .clear
        }
    }

    private var foreground: Color {
        switch kind {
        case .primary: return .black
        case .outline, .raised: return Theme.ink
        case .warn: return Theme.warn
        }
    }

    private var border: Color {
        switch kind {
        case .primary: return .clear
        case .outline: return .white.opacity(0.16)
        case .raised: return .white.opacity(0.12)
        case .warn: return Theme.warn
        }
    }
}

/// The boards' switch: 48×28, yellow with a black knob when on, a dark
/// track with a cream knob when off.
struct BoardSwitchStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button {
            configuration.isOn.toggle()
        } label: {
            HStack(spacing: 14) {
                configuration.label
                Spacer(minLength: 0)
                Knob(on: configuration.isOn)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityRepresentation {
            Toggle(isOn: configuration.$isOn) { configuration.label }
        }
    }

    struct Knob: View {
        let on: Bool
        @Environment(\.isEnabled) private var enabled

        var body: some View {
            Capsule()
                .fill(on ? Theme.accent : Color(hex: 0x4A453E))
                .frame(width: 48, height: 28)
                .overlay(alignment: on ? .trailing : .leading) {
                    Circle()
                        .fill(on ? Color.black : Theme.ink)
                        .frame(width: 22, height: 22)
                        .padding(3)
                }
                .opacity(enabled ? 1 : 0.6)
                .animation(.easeOut(duration: 0.15), value: on)
                .accessibilityHidden(true)
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
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.muted)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Theme.plate))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
