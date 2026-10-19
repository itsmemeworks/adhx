import Foundation
import Photos

/// A post's kept files, downloaded from your ADHX (`?download=1`), to save to
/// Photos or to send through the share sheet (WhatsApp, Messages…).
enum KeptFiles {
    struct File {
        let url: URL
        let isVideo: Bool
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
    static func download(_ post: PhonePost, server: URL) async -> [File]? {
        let sources = sources(of: post, server: server)
        guard !sources.isEmpty, await !stillKeeping(post) else { return nil }
        var files: [File] = []
        for (index, source) in sources.enumerated() {
            guard var comps = URLComponents(url: source.url, resolvingAgainstBaseURL: false) else { return nil }
            comps.queryItems = (comps.queryItems ?? []) + [URLQueryItem(name: "download", value: "1")]
            guard let from = comps.url,
                  let (file, response) = try? await URLSession.shared.download(from: from),
                  let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode)
            else { return nil }
            let suggested = (response.suggestedFilename as NSString?)?.pathExtension.lowercased() ?? ""
            let ext = suggested.isEmpty ? (source.isVideo ? "mp4" : "jpg") : suggested
            let suffix = sources.count > 1 ? "-\(index + 1)" : ""
            let named = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(post.platform)-\(post.postId)\(suffix)")
                .appendingPathExtension(ext)
            try? FileManager.default.removeItem(at: named)
            guard (try? FileManager.default.moveItem(at: file, to: named)) != nil else { return nil }
            files.append(File(url: named, isVideo: source.isVideo))
        }
        return files
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
        guard let files = await KeptFiles.download(post, server: server) else {
            return "Still being kept on your ADHX. Try again in a moment."
        }
        defer { files.forEach { try? FileManager.default.removeItem(at: $0.url) } }
        do {
            try await PHPhotoLibrary.shared().performChanges {
                for file in files {
                    if file.isVideo {
                        PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: file.url)
                    } else {
                        PHAssetChangeRequest.creationRequestForAssetFromImage(atFileURL: file.url)
                    }
                }
            }
            if files.count > 1 { return "\(files.count) photos saved to Photos" }
            return "Saved to Photos"
        } catch {
            return "That couldn’t be saved."
        }
    }
}
