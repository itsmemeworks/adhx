import PhotosUI
import SwiftUI
import UIKit

/// Changing your picture on the phone (`/api/app/me/avatar`): a photo or a
/// selfie cropped to a square here, a Gob face, your X photo, or none. Every
/// face of yours changes at once (`YourFace`).
@MainActor
final class PictureModel: ObservableObject {
    enum Action: Equatable { case photo, gob(GobColour), x, remove }

    /// What's on its way to your ADHX.
    @Published private(set) var busy: Action?
    @Published var problem: String?

    var onBadKey: () -> Void = {}

    /// A square photo, already cropped.
    func upload(_ image: UIImage) async -> Bool {
        guard let jpeg = image.jpegData(compressionQuality: 0.88) else {
            problem = "That photo won’t open. Try another."
            return false
        }
        return await change(.photo) { try await $0.setAvatar(jpeg: jpeg) }
    }

    func gob(_ colour: GobColour) async -> Bool {
        await change(.gob(colour)) { try await $0.setGobAvatar(colour) }
    }

    func useX() async -> Bool {
        await change(.x) { try await $0.useXAvatar() }
    }

    func remove() async -> Bool {
        await change(.remove) { try await $0.removeAvatar() }
    }

    private func change(_ action: Action, _ call: (ADHXClient) async throws -> AvatarAnswer) async -> Bool {
        guard busy == nil, let client = Store.client() else { return false }
        busy = action
        problem = nil
        defer { busy = nil }
        do {
            let answer = try await call(client)
            YourFace.shared.update(avatarUrl: answer.avatarUrl, source: answer.source)
            // What /api/app/me says now, so everything agrees.
            if let me = try? await client.me() { YourFace.shared.update(me) }
            return true
        } catch APIError.badKey {
            onBadKey()
        } catch let error as APIError where error.isMissing {
            problem = "Your ADHX needs an update before the app can change your picture."
        } catch let error as APIError {
            switch error.code {
            case "no_x_picture": problem = "There’s no X picture to use. Connect X to your ADHX first."
            case "too_big": problem = "That photo is too big. Try another."
            case "bad_type", "unreadable": problem = "That photo won’t open. Try another."
            case "busy": problem = "That’s a lot of new pictures. Try again in a bit."
            default: problem = error.message
            }
        } catch is CancellationError {
        } catch {
            problem = "That didn’t go through. Try again."
        }
        return false
    }
}

/// A photo to crop.
struct PhotoToCrop: Identifiable {
    let id = UUID()
    let image: UIImage
}

extension View {
    /// Settings' "Change picture": the choices, then the crop screen.
    func pictureChanger(isPresented: Binding<Bool>, server: URL?, onChanged: @escaping () -> Void,
                        onBadKey: @escaping () -> Void) -> some View {
        modifier(PictureChanger(isPresented: isPresented, server: server, onChanged: onChanged, onBadKey: onBadKey))
    }
}

private struct PictureChanger: ViewModifier {
    @Binding var isPresented: Bool
    let server: URL?
    let onChanged: () -> Void
    let onBadKey: () -> Void
    @StateObject private var model = PictureModel()
    @State private var cropping: PhotoToCrop?
    @State private var selfie = false

    func body(content: Content) -> some View {
        content
            .boardSheet(isPresented: $isPresented, height: 640) {
                PictureSheet(model: model, server: server,
                             picked: { image in
                                 isPresented = false
                                 cropping = PhotoToCrop(image: image)
                             },
                             takeSelfie: {
                                 isPresented = false
                                 selfie = true
                             },
                             changed: {
                                 isPresented = false
                                 onChanged()
                             })
            }
            .fullScreenCover(isPresented: $selfie) {
                CameraPicker { image in
                    selfie = false
                    if let image { cropping = PhotoToCrop(image: image) }
                }
                .ignoresSafeArea()
            }
            .fullScreenCover(item: $cropping) { photo in
                AvatarCropScreen(image: photo.image, model: model) {
                    cropping = nil
                    onChanged()
                } cancel: {
                    cropping = nil
                    isPresented = true
                }
            }
            .onAppear { model.onBadKey = onBadKey }
    }
}

/// The choices: a photo, a selfie, a Gob face, your X photo, or none.
private struct PictureSheet: View {
    @ObservedObject var model: PictureModel
    let server: URL?
    let picked: (UIImage) -> Void
    let takeSelfie: () -> Void
    let changed: () -> Void
    @ObservedObject private var yours = YourFace.shared
    @State private var item: PhotosPickerItem?
    @State private var loadingPhoto = false

    private var hasCamera: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                Face(saver: yours.you(), server: server, size: 64,
                     ring: Face.colour(for: yours.username ?? "you"))
                VStack(alignment: .leading, spacing: 3) {
                    Text("Your picture")
                        .font(Theme.serif(30))
                        .foregroundStyle(.white)
                        .accessibilityAddTraits(.isHeader)
                    Text("Your people see it on your saves and reactions.")
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.faint)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            VStack(spacing: 0) {
                PhotosPicker(selection: $item, matching: .images, photoLibrary: .shared()) {
                    choiceRow(icon: "photo.on.rectangle", title: "Choose a photo", busy: loadingPhoto)
                }
                .buttonStyle(.plain)
                .disabled(model.busy != nil || loadingPhoto)
                if hasCamera {
                    divider
                    Button(action: takeSelfie) {
                        choiceRow(icon: "camera", title: "Take a selfie")
                    }
                    .buttonStyle(.plain)
                    .disabled(model.busy != nil)
                }
            }
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Theme.plate))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

            gobs

            VStack(spacing: 0) {
                if yours.source != AvatarSource.x.rawValue {
                    Button {
                        Task { if await model.useX() { changed() } }
                    } label: {
                        choiceRow(icon: "at", title: "Use my X photo", busy: model.busy == .x)
                    }
                    .buttonStyle(.plain)
                    .disabled(model.busy != nil)
                }
                if yours.avatarUrl != nil {
                    if yours.source != AvatarSource.x.rawValue { divider }
                    Button {
                        Task { if await model.remove() { changed() } }
                    } label: {
                        choiceRow(icon: "trash", title: "Remove picture", tint: Theme.warn,
                                  busy: model.busy == .remove)
                    }
                    .buttonStyle(.plain)
                    .disabled(model.busy != nil)
                    .accessibilityHint("Your initial shows instead")
                }
            }
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Theme.plate))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

            if let problem = model.problem {
                Text(problem)
                    .font(Theme.sans(13, .bold))
                    .foregroundStyle(Theme.warn)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 24)
        .onChange(of: item) { _, new in
            guard let new else { return }
            Task { await load(new) }
        }
        .onChange(of: model.problem) { _, problem in
            if let problem { UIAccessibility.post(notification: .announcement, argument: problem) }
        }
    }

    private var gobs: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Or be a Gob")
                .font(Theme.sans(13, .heavy))
                .foregroundStyle(Theme.muted)
            HStack(spacing: 12) {
                ForEach(GobColour.allCases) { colour in
                    Button {
                        Task { if await model.gob(colour) { changed() } }
                    } label: {
                        ZStack {
                            Color(hex: 0x1A1814)
                            Gob(size: 50, colour: Color(hex: colour.hex))
                            if model.busy == .gob(colour) {
                                Color.black.opacity(0.45)
                                RingSpinner(size: 22, lineWidth: 2.5)
                            }
                        }
                        .frame(width: 64, height: 64)
                        .clipShape(GobShape())
                        .frame(maxWidth: .infinity)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(model.busy != nil)
                    .accessibilityLabel("Use a \(colour.label.lowercased()) Gob face")
                }
            }
        }
    }

    private var divider: some View {
        Rectangle().fill(.white.opacity(0.06)).frame(height: 1)
    }

    private func choiceRow(icon: String, title: String, tint: Color = Theme.ink, busy: Bool = false) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .semibold))
                .frame(width: 28)
                .accessibilityHidden(true)
            Text(title)
                .font(Theme.sans(15, .bold))
                .frame(maxWidth: .infinity, alignment: .leading)
            if busy { RingSpinner(size: 18, lineWidth: 2) }
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 16)
        .frame(minHeight: 54)
        .contentShape(Rectangle())
    }

    private func load(_ picked: PhotosPickerItem) async {
        loadingPhoto = true
        model.problem = nil
        defer {
            loadingPhoto = false
            item = nil
        }
        guard let data = try? await picked.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else {
            model.problem = "That photo won’t open. Try another."
            return
        }
        self.picked(image)
    }
}

// MARK: - Crop

/// Move and pinch your photo inside the circle, then Use.
struct AvatarCropScreen: View {
    let image: UIImage
    @ObservedObject var model: PictureModel
    let done: () -> Void
    let cancel: () -> Void
    @State private var zoom: CGFloat = 1
    @State private var pinchStart: CGFloat?
    @State private var offset: CGSize = .zero
    @State private var dragStart: CGSize?

    var body: some View {
        GeometryReader { geo in
            let side = max(120, min(geo.size.width - 40, geo.size.height - 240, 420))
            let centre = CGPoint(x: geo.size.width / 2, y: geo.size.height * 0.44)
            let shown = AvatarCrop.displaySize(imageSize: image.size, side: side, zoom: zoom)
            ZStack {
                Color.black.ignoresSafeArea()
                Image(uiImage: image)
                    .resizable()
                    .frame(width: shown.width, height: shown.height)
                    .position(x: centre.x + offset.width, y: centre.y + offset.height)
                    .accessibilityHidden(true)
                // Dim outside the circle: what's there won't be kept.
                Path { path in
                    path.addRect(CGRect(origin: .zero, size: geo.size).insetBy(dx: -400, dy: -400))
                    path.addEllipse(in: CGRect(x: centre.x - side / 2, y: centre.y - side / 2, width: side, height: side))
                }
                .fill(Color.black.opacity(0.62), style: FillStyle(eoFill: true))
                .allowsHitTesting(false)
                Circle()
                    .strokeBorder(.white.opacity(0.85), lineWidth: 2)
                    .frame(width: side, height: side)
                    .position(centre)
                    .allowsHitTesting(false)
                // The square that's sent, faintly.
                Rectangle()
                    .strokeBorder(.white.opacity(0.18), lineWidth: 1)
                    .frame(width: side, height: side)
                    .position(centre)
                    .allowsHitTesting(false)

                VStack(spacing: 6) {
                    Text("Move and pinch")
                        .font(Theme.serif(30))
                        .foregroundStyle(.white)
                        .accessibilityAddTraits(.isHeader)
                    Text("Your face goes in the circle.")
                        .font(Theme.sans(14))
                        .foregroundStyle(Theme.muted)
                }
                .padding(.top, 12)
                .frame(maxHeight: .infinity, alignment: .top)
                .allowsHitTesting(false)

                VStack(spacing: 10) {
                    if let problem = model.problem {
                        Text(problem)
                            .font(Theme.sans(13, .bold))
                            .foregroundStyle(Theme.warn)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    HStack(spacing: 10) {
                        Button("Cancel", action: cancel)
                            .buttonStyle(PillButtonStyle(kind: .outline))
                            .disabled(model.busy != nil)
                        Button {
                            Task { await use(side: side) }
                        } label: {
                            HStack(spacing: 8) {
                                if model.busy == .photo { ProgressView().tint(.black) }
                                Text(model.busy == .photo ? "Saving…" : "Use")
                            }
                        }
                        .buttonStyle(PillButtonStyle(kind: .primary))
                        .disabled(model.busy != nil)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 12)
                .frame(maxHeight: .infinity, alignment: .bottom)
            }
            .contentShape(Rectangle())
            .gesture(
                SimultaneousGesture(
                    DragGesture(minimumDistance: 1)
                        .onChanged { value in
                            let start = dragStart ?? offset
                            dragStart = start
                            offset = AvatarCrop.clampOffset(
                                CGSize(width: start.width + value.translation.width,
                                       height: start.height + value.translation.height),
                                imageSize: image.size, side: side, zoom: zoom)
                        }
                        .onEnded { _ in dragStart = nil },
                    MagnifyGesture()
                        .onChanged { value in
                            let start = pinchStart ?? zoom
                            pinchStart = start
                            let next = AvatarCrop.clampZoom(start * value.magnification)
                            // Zoom about the circle's centre: the same spot stays put.
                            let ratio = next / max(zoom, 0.0001)
                            zoom = next
                            offset = AvatarCrop.clampOffset(
                                CGSize(width: offset.width * ratio, height: offset.height * ratio),
                                imageSize: image.size, side: side, zoom: next)
                        }
                        .onEnded { _ in pinchStart = nil }
                )
            )
            .accessibilityElement(children: .contain)
            .accessibilityAction(named: "Zoom in") { setZoom(zoom + 0.5, side: side) }
            .accessibilityAction(named: "Zoom out") { setZoom(zoom - 0.5, side: side) }
        }
        .background(Color.black.ignoresSafeArea())
        .statusBarHidden()
        .onAppear { model.problem = nil }
    }

    private func setZoom(_ value: CGFloat, side: CGFloat) {
        zoom = AvatarCrop.clampZoom(value)
        offset = AvatarCrop.clampOffset(offset, imageSize: image.size, side: side, zoom: zoom)
    }

    private func use(side: CGFloat) async {
        let rect = AvatarCrop.sourceRect(imageSize: image.size, side: side, zoom: zoom, offset: offset)
        guard let square = Self.render(image, rect: rect) else {
            model.problem = "That photo won’t open. Try another."
            return
        }
        if await model.upload(square) { done() }
    }

    /// The square, drawn upright (the photo's own rotation applied).
    static func render(_ image: UIImage, rect: CGRect) -> UIImage? {
        guard rect.width > 0 else { return nil }
        let out = AvatarCrop.outputSide(cropPoints: rect.width, imageScale: image.scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let k = out / rect.width
        return UIGraphicsImageRenderer(size: CGSize(width: out, height: out), format: format).image { _ in
            image.draw(in: CGRect(x: -rect.minX * k, y: -rect.minY * k,
                                  width: image.size.width * k, height: image.size.height * k))
        }
    }
}

// MARK: - Camera

/// The front camera, for a selfie. nil: cancelled.
struct CameraPicker: UIViewControllerRepresentable {
    let done: (UIImage?) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(done: done) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        if UIImagePickerController.isCameraDeviceAvailable(.front) { picker.cameraDevice = .front }
        picker.cameraCaptureMode = .photo
        picker.allowsEditing = false
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let done: (UIImage?) -> Void
        init(done: @escaping (UIImage?) -> Void) { self.done = done }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            done(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            done(nil)
        }
    }
}
