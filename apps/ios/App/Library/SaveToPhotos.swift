import Foundation
import Photos

/// A post's kept files, downloaded from your ADHX (`?download=1`), to save to
/// Photos or to send through the share sheet (WhatsApp, Messages…).
enum KeptFiles {
    struct File {
        let url: URL
        let isVideo: Bool
    }

    /// One operation owns its files until Photos or the share activity finishes.
    /// Separate directories prevent concurrent Save and Share from deleting
    /// each other's copies. Cleanup is safe to call more than once.
    final class Export {
        let files: [File]
        private let directory: URL

        init(files: [File], directory: URL) {
            self.files = files
            self.directory = directory
        }

        func cleanup() { try? FileManager.default.removeItem(at: directory) }
        deinit { cleanup() }
    }

    /// The post's media worth keeping: a video or sound, or every photo of an album.
    static func sources(of post: PhonePost, server: URL) -> [(url: URL, isVideo: Bool)] {
        switch post.kind {
        case "video", "audio":
            guard let url = ADHXClient.resolve(post.media.first?.url, against: server) else { return [] }
            return [(url, true)]
        case "photo":
            return post.media.compactMap { media in
                ADHXClient.resolve(media.url, against: server).map { ($0, false) }
            }
        default:
            return []
        }
    }

    /// Your ADHX is still making its copy (so there's nothing to send yet).
    static func stillKeeping(_ post: PhonePost) async -> Bool {
        guard let client = Store.client(),
              let status = try? await client.status(platform: post.platform, id: post.postId) else { return false }
        return ["waiting", "keeping", "retrying"].contains(status.status)
    }

    /// Download them into temporary files named after the post. Nil when your
    /// ADHX hasn't kept a copy yet (or can't be reached).
    static func download(_ post: PhonePost, server: URL) async -> Export? {
        let sources = sources(of: post, server: server)
        guard !sources.isEmpty, await !stillKeeping(post) else { return nil }
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("adhx-export-\(UUID().uuidString)", isDirectory: true)
        guard (try? FileManager.default.createDirectory(
            at: directory, withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )) != nil else { return nil }
        var completed = false
        defer { if !completed { try? FileManager.default.removeItem(at: directory) } }
        var files: [File] = []
        for (index, source) in sources.enumerated() {
            guard !Task.isCancelled else { return nil }
            guard var comps = URLComponents(url: source.url, resolvingAgainstBaseURL: false) else { return nil }
            comps.queryItems = (comps.queryItems ?? []) + [URLQueryItem(name: "download", value: "1")]
            guard let from = comps.url,
                  let (file, response) = try? await URLSession.shared.download(from: from) else { return nil }
            defer { try? FileManager.default.removeItem(at: file) }
            guard !Task.isCancelled,
                  let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return nil }
            let suggested = (response.suggestedFilename as NSString?)?.pathExtension.lowercased() ?? ""
            let ext = suggested.isEmpty ? (source.isVideo ? "mp4" : "jpg") : suggested
            let suffix = sources.count > 1 ? "-\(index + 1)" : ""
            let stem = String("\(post.platform)-\(post.postId)".map {
                $0.isLetter || $0.isNumber || "._-".contains($0) ? $0 : "_"
            }.prefix(120))
            let named = directory
                .appendingPathComponent("\(stem)\(suffix)")
                .appendingPathExtension(ext)
            guard (try? FileManager.default.moveItem(at: file, to: named)) != nil else { return nil }
            files.append(File(url: named, isVideo: source.isVideo))
        }
        completed = true
        return Export(files: files, directory: directory)
    }
}

/// Save a post's video or photos to Photos.
enum SaveToPhotos {
    /// What to tell the person, in plain words.
    static func save(_ post: PhonePost, server: URL) async -> String {
        let access = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard access == .authorized || access == .limited else {
            return "ADHX can’t add to Photos. You can allow it in Settings."
        }
        guard let export = await KeptFiles.download(post, server: server) else {
            return "Still being kept on your ADHX. Try again in a moment."
        }
        defer { export.cleanup() }
        do {
            try await PHPhotoLibrary.shared().performChanges {
                for file in export.files {
                    if file.isVideo {
                        PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: file.url)
                    } else {
                        PHAssetChangeRequest.creationRequestForAssetFromImage(atFileURL: file.url)
                    }
                }
            }
            if export.files.count > 1 { return "\(export.files.count) photos saved to Photos" }
            return "Saved to Photos"
        } catch {
            return "That couldn’t be saved."
        }
    }
}
