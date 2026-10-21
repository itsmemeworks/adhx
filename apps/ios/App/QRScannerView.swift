import AVFoundation
import SwiftUI
import UIKit

/// Camera preview that reports QR codes (AVCaptureMetadataOutput).
struct QRScannerView: UIViewRepresentable {
    /// Stops reporting while true (for example while pairing).
    var paused: Bool
    let onCode: (String) -> Void

    func makeUIView(context: Context) -> ScannerUIView {
        let view = ScannerUIView()
        view.onCode = onCode
        view.start()
        return view
    }

    func updateUIView(_ view: ScannerUIView, context: Context) {
        view.onCode = onCode
        view.paused = paused
    }

    static func dismantleUIView(_ view: ScannerUIView, coordinator: ()) {
        view.stop()
    }

    enum Availability {
        case ready, denied, noCamera, undetermined
    }

    static var availability: Availability {
        guard AVCaptureDevice.default(for: .video) != nil else { return .noCamera }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return .ready
        case .notDetermined: return .undetermined
        default: return .denied
        }
    }

    static func requestAccess() async -> Bool {
        await AVCaptureDevice.requestAccess(for: .video)
    }
}

final class ScannerUIView: UIView, AVCaptureMetadataOutputObjectsDelegate {
    var onCode: ((String) -> Void)?
    var paused = false

    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "adhx.scanner")
    private var lastCode: String?
    private var lastCodeAt = Date.distantPast

    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    private var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }

    func start() {
        backgroundColor = .clear
        previewLayer.videoGravity = .resizeAspectFill
        previewLayer.session = session
        queue.async { [weak self] in
            guard let self else { return }
            guard let device = AVCaptureDevice.default(for: .video),
                  let input = try? AVCaptureDeviceInput(device: device) else { return }
            self.session.beginConfiguration()
            if self.session.canAddInput(input) { self.session.addInput(input) }
            let output = AVCaptureMetadataOutput()
            if self.session.canAddOutput(output) {
                self.session.addOutput(output)
                output.setMetadataObjectsDelegate(self, queue: .main)
                if output.availableMetadataObjectTypes.contains(.qr) {
                    output.metadataObjectTypes = [.qr]
                }
            }
            self.session.commitConfiguration()
            self.session.startRunning()
        }
    }

    func stop() {
        queue.async { [session] in
            if session.isRunning { session.stopRunning() }
        }
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        guard !paused else { return }
        for object in metadataObjects {
            guard let code = object as? AVMetadataMachineReadableCodeObject,
                  let value = code.stringValue else { continue }
            // The same code stays in view; don't report it again straight away.
            if value == lastCode && Date().timeIntervalSince(lastCodeAt) < 4 { return }
            lastCode = value
            lastCodeAt = Date()
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            onCode?(value)
            return
        }
    }
}
