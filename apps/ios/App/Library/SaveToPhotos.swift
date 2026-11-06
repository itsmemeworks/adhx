import Foundation
import Photos

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
        return await save(export)
    }

    /// Files already downloaded (the send sheet's), into Photos.
    static func save(_ export: KeptFiles.Export) async -> String {
        let access = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard access == .authorized || access == .limited else {
            return "ADHX can’t add to Photos. You can allow it in Settings."
        }
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
