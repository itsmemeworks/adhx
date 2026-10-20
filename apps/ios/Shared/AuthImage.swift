import SwiftUI
import UIKit

/// Pictures from your ADHX that need the phone key: members' faces
/// (`/api/files/avatar/<hash>` answers members only, since a face names
/// someone). The key goes only to your own server; a picture anywhere else
/// is fetched plainly. Kept in memory: a face's address changes with each
/// new picture, so a cached one never goes stale.
@MainActor
final class AuthImageLoader {
    static let shared = AuthImageLoader()

    private let cache: NSCache<NSURL, UIImage> = {
        let cache = NSCache<NSURL, UIImage>()
        cache.countLimit = 300
        return cache
    }()
    private var running: [URL: Task<UIImage?, Never>] = [:]

    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 20
        config.waitsForConnectivity = false
        return URLSession(configuration: config)
    }()

    func cached(_ url: URL) -> UIImage? {
        cache.object(forKey: url as NSURL)
    }

    /// The picture, from memory or the server (one request per address at a time).
    func image(for url: URL) async -> UIImage? {
        if let hit = cached(url) { return hit }
        if let inFlight = running[url] { return await inFlight.value }
        let task = Task.detached(priority: .utility) { await AuthImageLoader.fetch(url) }
        running[url] = task
        let image = await task.value
        running[url] = nil
        if let image { cache.setObject(image, forKey: url as NSURL) }
        return image
    }

    /// Forget everything (a different phone key or server).
    func clear() {
        cache.removeAllObjects()
    }

    private nonisolated static func fetch(_ url: URL) async -> UIImage? {
        var request = URLRequest(url: url)
        request.setValue("image/*", forHTTPHeaderField: "Accept")
        if let server = Store.server, sameOrigin(url, server), let key = Store.key {
            request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        }
        guard let (data, response) = try? await session.data(for: request),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let image = UIImage(data: data) else { return nil }
        return image.preparingForDisplay() ?? image
    }

    /// Same scheme, host and port: the key never leaves your ADHX.
    nonisolated static func sameOrigin(_ a: URL, _ b: URL) -> Bool {
        func port(_ u: URL) -> Int? { u.port ?? (u.scheme?.lowercased() == "https" ? 443 : 80) }
        return a.scheme?.lowercased() == b.scheme?.lowercased()
            && a.host?.lowercased() == b.host?.lowercased()
            && port(a) == port(b)
    }
}

/// A picture that fills its box, loaded with the phone key (see
/// `AuthImageLoader`), showing `placeholder` until it arrives or when it can't.
struct AuthImage<Placeholder: View>: View {
    let url: URL?
    @ViewBuilder var placeholder: () -> Placeholder
    @State private var loaded: UIImage?
    @State private var loadedFor: URL?

    var body: some View {
        // A cached picture shows on the first frame, without a flash of the placeholder.
        let image = loadedFor == url ? loaded : url.flatMap { AuthImageLoader.shared.cached($0) }
        ZStack {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                placeholder()
            }
        }
        .task(id: url) {
            guard let url else {
                loaded = nil
                loadedFor = nil
                return
            }
            let image = await AuthImageLoader.shared.image(for: url)
            guard !Task.isCancelled else { return }
            loaded = image
            loadedFor = url
        }
    }
}
