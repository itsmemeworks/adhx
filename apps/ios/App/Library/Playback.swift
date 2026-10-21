import AVFoundation
import AVKit
import SwiftUI
import UIKit

/// One player for the whole pager: it moves to whichever post is on screen,
/// loops it, and plays with sound when you've turned sound on (remembered for
/// every video until you turn it off). Files stream from your ADHX (`/api/files/…`).
@MainActor
final class Playback: ObservableObject {
    let player = AVPlayer()
    @Published private(set) var muted = true {
        didSet { player.isMuted = muted }
    }
    /// Fit the video whole at its own shape, instead of filling the screen.
    @Published private(set) var fitVideo = Prefs.fitVideo
    /// Sound or fit changed somewhere (another player, Settings): follow it.
    static let choicesChanged = Notification.Name("adhx.playback.choicesChanged")
    private var choicesWatch: NSObjectProtocol?
    @Published private(set) var paused = false
    @Published private(set) var ready = false
    /// Why it can't play, in the server's words when it gave any.
    @Published private(set) var problem: String?
    @Published private(set) var currentURL: URL?
    /// On: the video loops. Off (the default): the next save plays when it ends.
    /// Switched on after a video has run out (the last post), it plays again.
    @Published var repeatOne = false {
        didSet { if repeatOne, atEnd { replay() } }
    }
    /// Played to the end with nothing after it to move on to.
    private var atEnd = false
    /// Where it is and how long it is, in seconds (0 until known).
    @Published private(set) var time: Double = 0
    @Published private(set) var duration: Double = 0
    /// Where you're dragging the line to, in seconds (nil when not dragging).
    @Published var scrubTime: Double?
    /// A video finished with Repeat off.
    var onEnded: () -> Void = {}
    private var timeWatch: Any?

    /// The phone's own small window (picture-in-picture): from the button, or
    /// by itself when you leave the app while a video plays.
    @Published private(set) var pipPossible = false
    /// False where the phone has no small window (and in the Simulator).
    let pipSupported = AVPictureInPictureController.isPictureInPictureSupported()
    @Published private(set) var inPip = false
    private var pip: AVPictureInPictureController?
    private var pipWatches: [NSKeyValueObservation] = []
    private let pipDelegate = PipDelegate()

    private var statusWatch: NSKeyValueObservation?
    private var endWatch: NSObjectProtocol?
    private var stallWatch: NSObjectProtocol?

    init() {
        // Settings → "Sound on by default", or the last sound button you pressed.
        muted = !Prefs.soundOn
        player.isMuted = muted
        choicesWatch = NotificationCenter.default.addObserver(
            forName: Self.choicesChanged, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                if self.muted == Prefs.soundOn { self.muted = !Prefs.soundOn }
                if self.fitVideo != Prefs.fitVideo { self.fitVideo = Prefs.fitVideo }
            }
        }
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

    /// Sound on or off for this video and every one after it, until changed.
    func setSound(_ on: Bool) {
        Prefs.soundOn = on
        muted = !on
        NotificationCenter.default.post(name: Self.choicesChanged, object: nil)
    }

    /// Fill the screen, or fit the video whole; remembered.
    func setFitVideo(_ fit: Bool) {
        Prefs.fitVideo = fit
        fitVideo = fit
        NotificationCenter.default.post(name: Self.choicesChanged, object: nil)
    }

    /// The on-screen video's layer, for the small window to take over.
    func attach(_ layer: AVPlayerLayer) {
        guard AVPictureInPictureController.isPictureInPictureSupported(),
              pip?.playerLayer !== layer,
              let controller = AVPictureInPictureController(playerLayer: layer) else { return }
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        controller.delegate = pipDelegate
        pipWatches = [
            controller.observe(\.isPictureInPicturePossible, options: [.initial, .new]) { [weak self] c, _ in
                Task { @MainActor in self?.pipPossible = c.isPictureInPicturePossible }
            },
            controller.observe(\.isPictureInPictureActive, options: [.new]) { [weak self] c, _ in
                Task { @MainActor in self?.inPip = c.isPictureInPictureActive }
            },
        ]
        pip = controller
    }

    func startSmallWindow() {
        pip?.startPictureInPicture()
    }

    /// Leaving the app: a playing video carries on in the small window.
    var keepsPlayingOutside: Bool { inPip || (pipPossible && !paused && currentURL != nil) }

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
        atEnd = false
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
                    self.replay()
                } else {
                    self.atEnd = true
                    self.onEnded()
                }
            }
        }
        player.replaceCurrentItem(with: item)
        player.play()
    }

    /// Load the same file again (its copy has just been kept).
    func retry() {
        let url = currentURL
        currentURL = nil
        show(url)
    }

    func togglePause() {
        guard currentURL != nil else { return }
        if atEnd { return replay() }
        paused.toggle()
        if paused { player.pause() } else { player.play() }
    }

    /// From the top again.
    private func replay() {
        atEnd = false
        paused = false
        player.seek(to: .zero)
        player.play()
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
    /// Called with the layer once it's made (the small window needs it).
    var onLayer: (AVPlayerLayer) -> Void = { _ in }

    func makeUIView(context: Context) -> LayerHost {
        let view = LayerHost()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = fill ? .resizeAspectFill : .resizeAspect
        view.backgroundColor = .clear
        let layer = view.playerLayer
        DispatchQueue.main.async { onLayer(layer) }
        return view
    }

    func updateUIView(_ view: LayerHost, context: Context) {
        if view.playerLayer.player !== player { view.playerLayer.player = player }
        let gravity: AVLayerVideoGravity = fill ? .resizeAspectFill : .resizeAspect
        if view.playerLayer.videoGravity != gravity { view.playerLayer.videoGravity = gravity }
    }

    final class LayerHost: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}

/// Coming back from the small window lands on the same video.
private final class PipDelegate: NSObject, AVPictureInPictureControllerDelegate {
    func pictureInPictureController(
        _ controller: AVPictureInPictureController,
        restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completion: @escaping (Bool) -> Void
    ) {
        completion(true)
    }
}
