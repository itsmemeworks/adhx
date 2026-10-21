import CoreGraphics
import Foundation

/// The crop screen's sums: a photo filling a square (the round preview's box),
/// moved by `offset` (the photo's centre from the square's, in screen points)
/// and zoomed 1–4× past "the short side fills the square". Kept apart from the
/// view so the standalone tests can check it. The server crops the same way
/// (`cropRect` in `src/lib/avatar/store.ts`).
enum AvatarCrop {
    static let maxZoom: CGFloat = 4

    static func clampZoom(_ zoom: CGFloat) -> CGFloat {
        guard zoom.isFinite else { return 1 }
        return min(maxZoom, max(1, zoom))
    }

    /// Screen points per photo point.
    static func scale(imageSize: CGSize, side: CGFloat, zoom: CGFloat) -> CGFloat {
        let short = min(imageSize.width, imageSize.height)
        guard short > 0, side > 0 else { return 1 }
        return side / short * clampZoom(zoom)
    }

    /// How big the photo is drawn.
    static func displaySize(imageSize: CGSize, side: CGFloat, zoom: CGFloat) -> CGSize {
        let s = scale(imageSize: imageSize, side: side, zoom: zoom)
        return CGSize(width: imageSize.width * s, height: imageSize.height * s)
    }

    /// The offset moved back so the photo always covers the square.
    static func clampOffset(_ offset: CGSize, imageSize: CGSize, side: CGFloat, zoom: CGFloat) -> CGSize {
        let shown = displaySize(imageSize: imageSize, side: side, zoom: zoom)
        let spareX = max(0, (shown.width - side) / 2)
        let spareY = max(0, (shown.height - side) / 2)
        return CGSize(width: min(spareX, max(-spareX, offset.width)),
                      height: min(spareY, max(-spareY, offset.height)))
    }

    /// The square of the photo inside the round preview, in photo points.
    static func sourceRect(imageSize: CGSize, side: CGFloat, zoom: CGFloat, offset: CGSize) -> CGRect {
        let s = scale(imageSize: imageSize, side: side, zoom: zoom)
        let moved = clampOffset(offset, imageSize: imageSize, side: side, zoom: zoom)
        let size = side / s
        // The photo's top-left, measured from the square's top-left, in screen points.
        let left = side / 2 + moved.width - imageSize.width * s / 2
        let top = side / 2 + moved.height - imageSize.height * s / 2
        var x = -left / s
        var y = -top / s
        // Rounding can leave a hair outside the photo: keep it in.
        x = min(max(0, x), max(0, imageSize.width - size))
        y = min(max(0, y), max(0, imageSize.height - size))
        return CGRect(x: x, y: y, width: size, height: size)
    }

    /// The same crop as the server's form fields: the square's centre (0–1
    /// across the photo) and the zoom.
    static func serverCrop(imageSize: CGSize, side: CGFloat, zoom: CGFloat,
                           offset: CGSize) -> (x: Double, y: Double, zoom: Double) {
        let rect = sourceRect(imageSize: imageSize, side: side, zoom: zoom, offset: offset)
        guard imageSize.width > 0, imageSize.height > 0 else { return (0.5, 0.5, 1) }
        return (Double(rect.midX / imageSize.width), Double(rect.midY / imageSize.height),
                Double(clampZoom(zoom)))
    }

    /// How many pixels square to send: the crop's own size, at most 1024
    /// (the server keeps 512), and never under 256.
    static func outputSide(cropPoints: CGFloat, imageScale: CGFloat) -> CGFloat {
        let pixels = (cropPoints * max(1, imageScale)).rounded(.down)
        return min(1024, max(256, pixels))
    }
}
