import SwiftUI

/// A small SVG path-data parser (M L H V C S Q T A Z, absolute and relative),
/// enough for the Simple Icons marks. Builds a SwiftUI `Path` in the SVG's own
/// coordinates; `SVGShape` scales it into whatever frame it's drawn in.
enum SVGPath {
    private static var cache: [String: Path] = [:]
    private static let lock = NSLock()

    static func path(_ data: String) -> Path {
        lock.lock()
        defer { lock.unlock() }
        if let hit = cache[data] { return hit }
        let built = parse(data)
        cache[data] = built
        return built
    }

    static func parse(_ data: String) -> Path {
        var scanner = Scanner(Array(data.utf8))
        var path = Path()
        var current = CGPoint.zero
        var start = CGPoint.zero
        var lastControl: CGPoint?
        var lastCommand: UInt8 = 0
        var command: UInt8 = 0

        while true {
            scanner.skipSeparators()
            guard let byte = scanner.peek() else { break }
            if Scanner.isCommand(byte) {
                command = byte
                scanner.advance()
            } else if command == 0 {
                break
            } else if command == UInt8(ascii: "M") {
                command = UInt8(ascii: "L")  // extra pairs after M are lines
            } else if command == UInt8(ascii: "m") {
                command = UInt8(ascii: "l")
            } else if command == UInt8(ascii: "Z") || command == UInt8(ascii: "z") {
                break  // numbers after Z: malformed
            }

            let relative = command >= UInt8(ascii: "a")
            let upper = relative ? command - 32 : command
            func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
                relative ? CGPoint(x: current.x + x, y: current.y + y) : CGPoint(x: x, y: y)
            }

            switch upper {
            case UInt8(ascii: "M"):
                guard let x = scanner.number(), let y = scanner.number() else { return path }
                current = point(x, y)
                start = current
                path.move(to: current)
                lastControl = nil
            case UInt8(ascii: "L"):
                guard let x = scanner.number(), let y = scanner.number() else { return path }
                current = point(x, y)
                path.addLine(to: current)
                lastControl = nil
            case UInt8(ascii: "H"):
                guard let x = scanner.number() else { return path }
                current = CGPoint(x: relative ? current.x + x : x, y: current.y)
                path.addLine(to: current)
                lastControl = nil
            case UInt8(ascii: "V"):
                guard let y = scanner.number() else { return path }
                current = CGPoint(x: current.x, y: relative ? current.y + y : y)
                path.addLine(to: current)
                lastControl = nil
            case UInt8(ascii: "C"):
                guard let x1 = scanner.number(), let y1 = scanner.number(),
                      let x2 = scanner.number(), let y2 = scanner.number(),
                      let x = scanner.number(), let y = scanner.number() else { return path }
                let c1 = point(x1, y1), c2 = point(x2, y2), end = point(x, y)
                path.addCurve(to: end, control1: c1, control2: c2)
                lastControl = c2
                current = end
            case UInt8(ascii: "S"):
                guard let x2 = scanner.number(), let y2 = scanner.number(),
                      let x = scanner.number(), let y = scanner.number() else { return path }
                let wasCubic = [UInt8(ascii: "C"), UInt8(ascii: "S")].contains(upperOf(lastCommand))
                let c1 = wasCubic ? reflect(lastControl, about: current) : current
                let c2 = point(x2, y2), end = point(x, y)
                path.addCurve(to: end, control1: c1, control2: c2)
                lastControl = c2
                current = end
            case UInt8(ascii: "Q"):
                guard let x1 = scanner.number(), let y1 = scanner.number(),
                      let x = scanner.number(), let y = scanner.number() else { return path }
                let c = point(x1, y1), end = point(x, y)
                path.addQuadCurve(to: end, control: c)
                lastControl = c
                current = end
            case UInt8(ascii: "T"):
                guard let x = scanner.number(), let y = scanner.number() else { return path }
                let wasQuad = [UInt8(ascii: "Q"), UInt8(ascii: "T")].contains(upperOf(lastCommand))
                let c = wasQuad ? reflect(lastControl, about: current) : current
                let end = point(x, y)
                path.addQuadCurve(to: end, control: c)
                lastControl = c
                current = end
            case UInt8(ascii: "A"):
                guard let rx = scanner.number(), let ry = scanner.number(),
                      let rotation = scanner.number(),
                      let large = scanner.flag(), let sweep = scanner.flag(),
                      let x = scanner.number(), let y = scanner.number() else { return path }
                let end = point(x, y)
                addArc(to: &path, from: current, to: end, rx: rx, ry: ry,
                       rotation: rotation, large: large, sweep: sweep)
                current = end
                lastControl = nil
            case UInt8(ascii: "Z"):
                path.closeSubpath()
                current = start
                lastControl = nil
            default:
                return path
            }
            lastCommand = command
        }
        return path
    }

    private static func upperOf(_ c: UInt8) -> UInt8 { c >= UInt8(ascii: "a") ? c - 32 : c }

    private static func reflect(_ control: CGPoint?, about p: CGPoint) -> CGPoint {
        guard let control else { return p }
        return CGPoint(x: 2 * p.x - control.x, y: 2 * p.y - control.y)
    }

    /// SVG endpoint arc → centre form (SVG 1.1 appendix F.6.5), drawn as a
    /// transformed unit-circle arc.
    private static func addArc(to path: inout Path, from p1: CGPoint, to p2: CGPoint,
                               rx rxIn: CGFloat, ry ryIn: CGFloat, rotation: CGFloat,
                               large: Bool, sweep: Bool) {
        if p1 == p2 { return }
        var rx = abs(rxIn), ry = abs(ryIn)
        if rx == 0 || ry == 0 {
            path.addLine(to: p2)
            return
        }
        let phi = rotation * .pi / 180
        let cosPhi = cos(phi), sinPhi = sin(phi)
        let dx = (p1.x - p2.x) / 2, dy = (p1.y - p2.y) / 2
        let x1p = cosPhi * dx + sinPhi * dy
        let y1p = -sinPhi * dx + cosPhi * dy

        let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 {
            let s = sqrt(lambda)
            rx *= s
            ry *= s
        }
        let num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
        let den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
        var coef = den == 0 ? 0 : sqrt(max(0, num / den))
        if large == sweep { coef = -coef }
        let cxp = coef * (rx * y1p / ry)
        let cyp = coef * -(ry * x1p / rx)
        let cx = cosPhi * cxp - sinPhi * cyp + (p1.x + p2.x) / 2
        let cy = sinPhi * cxp + cosPhi * cyp + (p1.y + p2.y) / 2

        func angle(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
            atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        }
        let ux = (x1p - cxp) / rx, uy = (y1p - cyp) / ry
        let vx = (-x1p - cxp) / rx, vy = (-y1p - cyp) / ry
        let theta1 = angle(1, 0, ux, uy)
        var delta = angle(ux, uy, vx, vy)
        if !sweep && delta > 0 { delta -= 2 * .pi }
        if sweep && delta < 0 { delta += 2 * .pi }

        let transform = CGAffineTransform(translationX: cx, y: cy)
            .rotated(by: phi)
            .scaledBy(x: rx, y: ry)
        path.addRelativeArc(center: .zero, radius: 1,
                            startAngle: .radians(Double(theta1)),
                            delta: .radians(Double(delta)),
                            transform: transform)
    }

    private struct Scanner {
        let bytes: [UInt8]
        var index = 0

        init(_ bytes: [UInt8]) { self.bytes = bytes }

        func peek() -> UInt8? { index < bytes.count ? bytes[index] : nil }
        mutating func advance() { index += 1 }

        static func isCommand(_ b: UInt8) -> Bool {
            switch b {
            case UInt8(ascii: "M"), UInt8(ascii: "m"), UInt8(ascii: "L"), UInt8(ascii: "l"),
                 UInt8(ascii: "H"), UInt8(ascii: "h"), UInt8(ascii: "V"), UInt8(ascii: "v"),
                 UInt8(ascii: "C"), UInt8(ascii: "c"), UInt8(ascii: "S"), UInt8(ascii: "s"),
                 UInt8(ascii: "Q"), UInt8(ascii: "q"), UInt8(ascii: "T"), UInt8(ascii: "t"),
                 UInt8(ascii: "A"), UInt8(ascii: "a"), UInt8(ascii: "Z"), UInt8(ascii: "z"):
                return true
            default:
                return false
            }
        }

        mutating func skipSeparators() {
            while let b = peek(), b == UInt8(ascii: " ") || b == UInt8(ascii: ",")
                || b == UInt8(ascii: "\n") || b == UInt8(ascii: "\t") || b == UInt8(ascii: "\r") {
                index += 1
            }
        }

        /// Arc flags are a single 0 or 1 and may be packed with no separator.
        mutating func flag() -> Bool? {
            skipSeparators()
            guard let b = peek() else { return nil }
            if b == UInt8(ascii: "0") { index += 1; return false }
            if b == UInt8(ascii: "1") { index += 1; return true }
            return nil
        }

        mutating func number() -> CGFloat? {
            skipSeparators()
            let begin = index
            if let b = peek(), b == UInt8(ascii: "-") || b == UInt8(ascii: "+") { index += 1 }
            var sawDigit = false, sawDot = false
            while let b = peek() {
                if b >= UInt8(ascii: "0") && b <= UInt8(ascii: "9") {
                    sawDigit = true
                    index += 1
                } else if b == UInt8(ascii: ".") && !sawDot {
                    sawDot = true
                    index += 1
                } else {
                    break
                }
            }
            if sawDigit, let b = peek(), b == UInt8(ascii: "e") || b == UInt8(ascii: "E") {
                var look = index + 1
                if look < bytes.count, bytes[look] == UInt8(ascii: "-") || bytes[look] == UInt8(ascii: "+") { look += 1 }
                if look < bytes.count, bytes[look] >= UInt8(ascii: "0"), bytes[look] <= UInt8(ascii: "9") {
                    index = look
                    while let d = peek(), d >= UInt8(ascii: "0") && d <= UInt8(ascii: "9") { index += 1 }
                }
            }
            guard sawDigit, let text = String(bytes: bytes[begin..<index], encoding: .ascii),
                  let value = Double(text) else {
                index = begin
                return nil
            }
            return CGFloat(value)
        }
    }
}

/// Draws SVG path data from a square viewBox (24×24 by default) scaled to fit.
struct SVGShape: Shape {
    let data: String
    var viewBox: CGFloat = 24

    func path(in rect: CGRect) -> Path {
        let side = min(rect.width, rect.height)
        let scale = side / viewBox
        let transform = CGAffineTransform(translationX: rect.midX - side / 2, y: rect.midY - side / 2)
            .scaledBy(x: scale, y: scale)
        return SVGPath.path(data).applying(transform)
    }
}
