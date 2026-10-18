import Foundation
import Photos

/// Save a post's video or photo to Photos, from your ADHX (`?download=1`).
enum SaveToPhotos {
    /// What to tell the person, in plain words.
    static func save(_ url: URL, isVideo: Bool) async -> String {
        let access = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard access == .authorized || access == .limited else {
            return "ADHX can’t add to Photos. You can allow it in Settings."
        }
        guard var comps = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return "That couldn’t be saved."
        }
        let query = comps.queryItems ?? []
        comps.queryItems = query + [URLQueryItem(name: "download", value: "1")]
        guard let from = comps.url else { return "That couldn’t be saved." }
        do {
            let (file, response) = try await URLSession.shared.download(from: from)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                return "That isn’t on your ADHX yet. Try again in a bit."
            }
            let ext = (response.suggestedFilename as NSString?)?.pathExtension.lowercased()
            let named = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension(ext?.isEmpty == false ? ext! : (isVideo ? "mp4" : "jpg"))
            try FileManager.default.moveItem(at: file, to: named)
            defer { try? FileManager.default.removeItem(at: named) }
            try await PHPhotoLibrary.shared().performChanges {
                if isVideo {
                    PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: named)
                } else {
                    PHAssetChangeRequest.creationRequestForAssetFromImage(atFileURL: named)
                }
            }
            return "Saved to Photos"
        } catch {
            return "That couldn’t be saved."
        }
    }
}
