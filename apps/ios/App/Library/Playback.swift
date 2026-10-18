import AVFoundation
import SwiftUI
import UIKit

/// One player for the whole pager: it moves to whichever post is on screen,
/// loops it, and starts muted. Files stream from your ADHX (`/api/files/…`).
@MainActor
final class Playback: ObservableObject {
    let player = AVPlayer()
    @Published var muted = true {
        didSet { player.isMuted = muted }
    }
    @Published private(set) var paused = false
    @Published private(set) var ready = false
    /// Why it can't play, in the server's words when it gave any.
    @Published private(set) var problem: String?
    @Published private(set) var currentURL: URL?
    /// On: the video loops. Off (the default): the next save plays when it ends.
    @Published var repeatOne = false
    /// Where it is and how long it is, in seconds (0 until known).
    @Published private(set) var time: Double = 0
    @Published private(set) var duration: Double = 0
    /// A video finished with Repeat off.
    var onEnded: () -> Void = {}
    private var timeWatch: Any?

    private var statusWatch: NSKeyValueObservation?
    private var endWatch: NSObjectProtocol?
    private var stallWatch: NSObjectProtocol?

    init() {
        player.isMuted = true
        player.automaticallyWaitsToMinimizeStalling = true
        // Sound plays with the ring/silent switch off, like other video apps.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        timeWatch = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main
        ) { [weak self] now in
            Task { @MainActor in
                guard let self else { return }
                self.time = now.seconds.isFinite ? now.seconds : 0
                if let length = self.player.currentItem?.duration.seconds, length.isFinite {
                    self.duration = length
                }
            }
        }
    }

    func seek(to seconds: Double) {
        player.seek(to: CMTime(seconds: seconds, preferredTimescale: 600),
                    toleranceBefore: .zero, toleranceAfter: .zero)
        time = seconds
    }

    /// Play this file, or stop when nothing on screen plays.
    func show(_ url: URL?) {
        guard url != currentURL else {
            if url != nil, !paused { player.play() }
            return
        }
        currentURL = url
        problem = nil
        ready = false
        paused = false
        time = 0
        duration = 0
        statusWatch = nil
        if let endWatch { NotificationCenter.default.removeObserver(endWatch) }
        if let stallWatch { NotificationCenter.default.removeObserver(stallWatch) }
        guard let url else {
            player.replaceCurrentItem(with: nil)
            return
        }
        let item = AVPlayerItem(url: url)
        item.preferredForwardBufferDuration = 4
        statusWatch = item.observe(\.status) { [weak self] item, _ in
            Task { @MainActor in self?.itemChanged(item, url: url) }
        }
        endWatch = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                if self.repeatOne {
                    self.player.seek(to: .zero)
                    self.player.play()
                } else {
                    self.onEnded()
                }
            }
        }
        player.replaceCurrentItem(with: item)
        player.play()
    }

    func togglePause() {
        guard currentURL != nil else { return }
        paused.toggle()
        if paused { player.pause() } else { player.play() }
    }

    /// Leaving the player (or the app going to the background).
    func stop() {
        player.pause()
        paused = true
    }

    func resume() {
        guard currentURL != nil else { return }
        paused = false
        player.play()
    }

    private func itemChanged(_ item: AVPlayerItem, url: URL) {
        guard url == currentURL else { return }
        switch item.status {
        case .readyToPlay:
            ready = true
        case .failed:
            problem = "This video couldn’t load."
            Task { await explain(url) }
        default:
            break
        }
    }

    /// A video that can't play says why (404/410 with `{ reason }`), like the web player.
    private func explain(_ url: URL) async {
        var request = URLRequest(url: url, timeoutInterval: 10)
        request.setValue("bytes=0-1", forHTTPHeaderField: "Range")
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, [404, 410].contains(http.statusCode),
              let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let reason = body["reason"] as? String, url == currentURL
        else { return }
        problem = reason
    }
}

/// The player's picture, for the post on screen.
struct PlayerLayerView: UIViewRepresentable {
    let player: AVPlayer
    var fill = false

    func makeUIView(context: Context) -> LayerHost {
        let view = LayerHost()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = fill ? .resizeAspectFill : .resizeAspect
        view.backgroundColor = .clear
        return view
    }

    func updateUIView(_ view: LayerHost, context: Context) {
        if view.playerLayer.player !== player { view.playerLayer.player = player }
    }

    final class LayerHost: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}
