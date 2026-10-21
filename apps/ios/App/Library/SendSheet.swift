import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Sending the file itself (board j4-4): the video or photos come down from
/// your ADHX with a progress line, then go out through WhatsApp, the
/// clipboard, Files, Photos or the system share sheet, so what your friend gets still plays
/// when the original link is long dead.
@MainActor
final class SendModel: ObservableObject {
    let post: PhonePost
    let server: URL
    @Published private(set) var received: Int64 = 0
    @Published private(set) var expected: Int64 = 0
    @Published private(set) var export: KeptFiles.Export?
    @Published private(set) var failed = false
    private var task: Task<Void, Never>?

    /// "Or straight to your people": nil until it loads, or when this ADHX
    /// can't send (an older server, or a post you can't see).
    @Published private(set) var targets: SendTargets?
    /// People a send is on its way to.
    @Published private(set) var sendingTo: Set<String> = []
    /// Words for a send that didn't go.
    @Published private(set) var sendProblem: String?
    var onBadKey: () -> Void = {}

    init(post: PhonePost, server: URL) {
        self.post = post
        self.server = server
    }

    var fraction: Double {
        if export != nil { return 1 }
        guard expected > 0 else { return 0 }
        return min(Double(received) / Double(expected), 1)
    }

    func start() {
        guard task == nil, export == nil else { return }
        failed = false
        task = Task { [weak self] in
            guard let self else { return }
            let result = await KeptFiles.download(post, server: server) { [weak self] got, total in
                self?.received = got
                self?.expected = total
            }
            if Task.isCancelled { result?.cleanup(); return }
            if let result {
                export = result
                let size = result.files.reduce(Int64(0)) { sum, file in
                    sum + ((try? FileManager.default.attributesOfItem(atPath: file.url.path)[.size] as? Int64) ?? 0)
                }
                received = size
                expected = size
            } else {
                failed = true
            }
            task = nil
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }

    // MARK: Straight to your people

    func loadTargets() async {
        guard targets == nil, let client = Store.client() else { return }
        do {
            targets = try await client.sendTargets(post.ref)
        } catch APIError.badKey {
            onBadKey()
        } catch {
            // 404: an older ADHX, or no save of it you can see. Leave the row out.
            targets = nil
        }
    }

    /// Sends the post to one person; their face gets a tick when it lands.
    func send(to person: SendPerson) async {
        guard let client = Store.client(), let current = targets, current.sendable,
              !person.has, !person.sent, !sendingTo.contains(person.username) else { return }
        sendingTo.insert(person.username)
        sendProblem = nil
        defer { sendingTo.remove(person.username) }
        do {
            let result = try await client.sendPost(post.ref, to: [person.username])
            let skipped = result.skipped.first { $0.username == person.username }
            update(person.username) { someone in
                if result.sent.contains(person.username) || skipped?.reason == "sent" { someone.sent = true }
                if skipped?.reason == "has" { someone.has = true }
            }
            if skipped?.reason == "unknown" { sendProblem = "\(person.displayName) isn’t on your ADHX any more." }
        } catch APIError.badKey {
            onBadKey()
        } catch APIError.server(status: 429, code: _, message: _) {
            sendProblem = "That’s a lot of sending. Try again in a minute."
        } catch let error as APIError {
            sendProblem = error.message
        } catch {
            sendProblem = APIError.offline.message
        }
    }

    private func update(_ username: String, _ change: (inout SendPerson) -> Void) {
        guard let current = targets else { return }
        var people = current.people
        if let index = people.firstIndex(where: { $0.username == username }) { change(&people[index]) }
        targets = SendTargets(sendable: current.sendable, people: people)
    }
}

struct SendSheet: View {
    @StateObject private var model: SendModel
    let say: (String) -> Void
    @Environment(\.dismiss) private var systemDismiss
    @Environment(\.boardDismiss) private var boardDismiss
    private var dismiss: SheetCloser { SheetCloser(board: boardDismiss, system: systemDismiss) }
    @State private var composing: Composer?

    init(post: PhonePost, server: URL, say: @escaping (String) -> Void) {
        _model = StateObject(wrappedValue: SendModel(post: post, server: server))
        self.say = say
    }

    private var post: PhonePost { model.post }
    private var ready: Bool { model.export != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            card
            Text("SEND VIA")
                .font(Theme.sans(12, .heavy))
                .tracking(0.96)
                .foregroundStyle(Theme.faint)
                .padding(.top, 6)
                .accessibilityAddTraits(.isHeader)
            HStack(alignment: .top, spacing: 0) {
                target("WhatsApp", mark: AnyView(
                    SVGShape(data: NetworkPaths.whatsapp).fill(Theme.ink).frame(width: 24, height: 24)
                )) { sendToWhatsApp() }
                Spacer(minLength: 4)
                target("Copy", icon: "doc.on.doc") { copyFiles() }
                Spacer(minLength: 4)
                target("Files", icon: "folder") { open(.files) }
                Spacer(minLength: 4)
                target(post.kind == "audio" ? "Save" : "Save to Photos", icon: "photo") { saveToPhotos() }
                    .opacity(post.kind == "audio" ? 0 : 1)
                    .disabled(post.kind == "audio")
                Spacer(minLength: 4)
                target("More", icon: "ellipsis") { open(.more) }
            }
            if let targets = model.targets, !targets.sendable || !targets.people.isEmpty {
                yourPeople(targets)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 20)
        .onAppear { model.start() }
        .task { await model.loadTargets() }
        .onDisappear {
            model.stop()
            if composing == nil { model.export?.cleanup() }
        }
        .sheet(item: $composing) { composer in
            composerView(composer)
                .ignoresSafeArea()
                .presentationDetents(composer == .more ? [.medium, .large] : [.large])
        }
    }

    // MARK: The file

    private var card: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 14) {
                // An upright poster, 54 × 96, with the kind on a small dark disc.
                CoverImage(url: ADHXClient.resolve(post.posterUrl ?? post.media.first?.url, against: model.server))
                    .frame(width: 54, height: 96)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(alignment: .bottomLeading) {
                        Image(systemName: post.kind == "photo" ? "photo" : "video")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 22, height: 22)
                            .background(Circle().fill(.black.opacity(0.6)))
                            .padding(4)
                    }
                VStack(alignment: .leading, spacing: 6) {
                    Text(title)
                        .font(Theme.sans(17, .heavy))
                        .foregroundStyle(Theme.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text(detail)
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.muted)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(stateLine)
                        .font(Theme.sans(12, .semibold))
                        .foregroundStyle(model.failed ? Theme.warn : Theme.ink)
                    Spacer(minLength: 8)
                    if let sizeLine {
                        Text(sizeLine)
                            .font(Theme.sans(12))
                            .monospacedDigit()
                            .foregroundStyle(Theme.faint)
                    }
                }
                GeometryReader { box in
                    ZStack(alignment: .leading) {
                        Capsule().fill(.white.opacity(0.12))
                        Capsule().fill(model.failed ? Theme.warn : Theme.accent)
                            .frame(width: max(box.size.width * model.fraction, model.fraction > 0 ? 6 : 0))
                    }
                }
                .frame(height: 6)
                .animation(.linear(duration: 0.2), value: model.fraction)
                if model.failed {
                    Button("Try again") { model.start() }
                        .buttonStyle(PillButtonStyle(kind: .outline, height: 40, fullWidth: false, fontSize: 14))
                }
            }
            .accessibilityElement(children: .combine)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Theme.raised.opacity(0.6)))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(.white.opacity(0.06)))
    }

    private var title: String {
        switch post.kind {
        case "photo": return post.media.count > 1 ? "Sending the photos themselves" : "Sending the photo itself"
        case "audio": return "Sending the sound itself"
        default: return "Sending the video itself"
        }
    }

    /// "1080p · 12 MB · not a link that dies next month".
    private var detail: String {
        var parts: [String] = []
        if post.kind == "video", let media = post.media.first, let w = media.width, let h = media.height, w > 0, h > 0 {
            parts.append("\(min(w, h))p")
        }
        if model.expected > 0 { parts.append(Self.megabytes(model.expected)) }
        parts.append("not a link that dies next month")
        return parts.joined(separator: " · ")
    }

    private var stateLine: String {
        if model.failed { return "Still being kept on your ADHX. Try again in a moment." }
        if ready { return "Ready to send" }
        return "Downloading from your ADHX · \(Int((model.fraction * 100).rounded()))%"
    }

    /// "9.6 of 12 MB".
    private var sizeLine: String? {
        guard model.expected > 0, !model.failed else { return nil }
        if ready { return Self.megabytes(model.expected) }
        let got = Double(model.received) / 1_000_000
        return String(format: got < 10 ? "%.1f" : "%.0f", got) + " of " + Self.megabytes(model.expected)
    }

    private static func megabytes(_ bytes: Int64) -> String {
        let mb = Double(bytes) / 1_000_000
        if mb < 1 { return "\(max(1, Int((Double(bytes) / 1000).rounded()))) KB" }
        return String(format: mb < 10 ? "%.1f MB" : "%.0f MB", mb)
    }

    // MARK: Straight to your people

    /// "OR STRAIGHT TO YOUR PEOPLE": a face each; tap one to send it to
    /// them. Someone who has it already is dimmed, and said so.
    private func yourPeople(_ targets: SendTargets) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("OR STRAIGHT TO YOUR PEOPLE")
                .font(Theme.sans(12, .heavy))
                .tracking(0.72)
                .foregroundStyle(Theme.faint)
                .accessibilityAddTraits(.isHeader)
            if !targets.sendable {
                Text("Just for you. Share it first to send it.")
                    .font(Theme.sans(14))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                // The boards' row: the note beside the faces while they fit, else under them.
                let note = targets.alreadyLine
                if targets.people.count <= 4, (note?.count ?? 0) <= 22 {
                    HStack(alignment: .center, spacing: 18) {
                        ForEach(targets.people) { personButton($0) }
                        if let note { alreadyNote(note).frame(maxWidth: .infinity, alignment: .trailing) }
                    }
                } else {
                    ScrollView(.horizontal) {
                        HStack(alignment: .top, spacing: 18) {
                            ForEach(targets.people) { personButton($0) }
                        }
                        .padding(.horizontal, 16)
                    }
                    .scrollIndicators(.hidden)
                    .padding(.horizontal, -16)
                    if let note { alreadyNote(note) }
                }
                if let problem = model.sendProblem {
                    Text(problem)
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.warn)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.top, 4)
    }

    private func alreadyNote(_ text: String) -> some View {
        Text(text)
            .font(Theme.sans(12))
            .lineSpacing(2)
            .foregroundStyle(Theme.faint)
            .multilineTextAlignment(.trailing)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func personButton(_ person: SendPerson) -> some View {
        let busy = model.sendingTo.contains(person.username)
        return Button {
            Task { await model.send(to: person) }
        } label: {
            VStack(spacing: 6) {
                Face(saver: person.asSaver, server: model.server, size: 52, ring: .clear)
                    .overlay(alignment: .bottomTrailing) {
                        if person.sent {
                            Image(systemName: "checkmark")
                                .font(.system(size: 11, weight: .heavy))
                                .foregroundStyle(.black)
                                .frame(width: 22, height: 22)
                                .background(Circle().fill(Theme.accent))
                                .overlay(Circle().strokeBorder(Theme.surface, lineWidth: 2))
                                .offset(x: 4, y: 4)
                                .transition(.scale.combined(with: .opacity))
                        } else if busy {
                            RingSpinner(size: 18, lineWidth: 2)
                                .padding(2)
                                .background(Circle().fill(Theme.surface))
                                .offset(x: 4, y: 4)
                        }
                    }
                Text(person.displayName)
                    .font(Theme.sans(12, .semibold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
            }
            .frame(minWidth: 52)
            .opacity(person.has ? 0.4 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: person.sent)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // Not `.disabled`: that would dim a face that just got its tick.
        .allowsHitTesting(!(person.has || person.sent || busy))
        .accessibilityLabel(person.displayName)
        .accessibilityValue(person.has ? "Already has it" : person.sent ? "Sent" : busy ? "Sending" : "")
        .accessibilityHint(person.has || person.sent ? "" : "Sends it to \(person.displayName)")
    }

    // MARK: Where it goes

    private func target(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        target(title, mark: AnyView(Image(systemName: icon)
            .font(.system(size: 22, weight: .regular))
            .foregroundStyle(Theme.ink)), action: action)
    }

    private func target(_ title: String, mark: AnyView, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                mark
                    .frame(width: 60, height: 60)
                    .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.plate))
                Text(title)
                    .font(Theme.sans(12, .semibold))
                    .foregroundStyle(Theme.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(width: 64)
            .opacity(ready ? 1 : 0.45)
        }
        .buttonStyle(.plain)
        .disabled(!ready)
        .accessibilityLabel(title)
        .accessibilityHint(ready ? "" : "Waits for the download")
    }

    private enum Composer: String, Identifiable {
        case files, more
        var id: String { rawValue }
    }

    private func open(_ composer: Composer) {
        guard ready else { return }
        composing = composer
    }

    /// Straight into WhatsApp with the file. WhatsApp takes one file this way;
    /// an album, or a phone without WhatsApp, gets the share sheet instead.
    private func sendToWhatsApp() {
        guard let files = model.export?.files, !files.isEmpty else { return }
        if files.count == 1, WhatsApp.installed, WhatsApp.open(files[0].url, kind: post.kind) { return }
        composing = .more
    }

    /// The file itself on the clipboard, to paste into any chat.
    private func copyFiles() {
        guard let files = model.export?.files, !files.isEmpty else { return }
        let providers = files.compactMap { NSItemProvider(contentsOf: $0.url) }
        guard !providers.isEmpty else { return }
        UIPasteboard.general.itemProviders = providers
        say(files.count > 1 ? "Photos copied. Paste them into any chat." : "Copied. Paste it into any chat.")
        dismiss()
    }

    private func saveToPhotos() {
        guard let export = model.export else { return }
        Task {
            let words = await SaveToPhotos.save(export)
            say(words)
            dismiss()
        }
    }

    @ViewBuilder
    private func composerView(_ composer: Composer) -> some View {
        let urls = model.export?.files.map(\.url) ?? []
        // Sent: the send sheet's done too. Cancelled: back to the choices.
        let finish: (Bool) -> Void = { sent in
            composing = nil
            if sent { dismiss() }
        }
        switch composer {
        case .files: FileExporter(files: urls, finish: finish)
        case .more: SystemShare(files: urls, finish: finish)
        }
    }
}

// MARK: - Files and the share sheet

private struct FileExporter: UIViewControllerRepresentable {
    let files: [URL]
    let finish: (Bool) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(finish: finish) }

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let controller = UIDocumentPickerViewController(forExporting: files, asCopy: true)
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: UIDocumentPickerViewController, context: Context) {}

    final class Coordinator: NSObject, UIDocumentPickerDelegate {
        let finish: (Bool) -> Void
        init(finish: @escaping (Bool) -> Void) { self.finish = finish }
        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { finish(true) }
        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finish(false) }
    }
}

private struct SystemShare: UIViewControllerRepresentable {
    let files: [URL]
    let finish: (Bool) -> Void

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: files, applicationActivities: nil)
        controller.completionWithItemsHandler = { _, completed, _, _ in finish(completed) }
        return controller
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// WhatsApp's own way in for a file: a copy with its extension, offered
/// only to WhatsApp ("net.whatsapp.image" / "movie" / "audio").
@MainActor
private enum WhatsApp {
    /// Needs `whatsapp` in LSApplicationQueriesSchemes.
    static var installed: Bool {
        URL(string: "whatsapp://app").map { UIApplication.shared.canOpenURL($0) } ?? false
    }

    /// Kept while WhatsApp's menu is up.
    private static var interaction: UIDocumentInteractionController?

    static func open(_ file: URL, kind: String) -> Bool {
        let (ext, uti): (String, String) = switch kind {
        case "photo": ("wai", "net.whatsapp.image")
        case "audio": ("waa", "net.whatsapp.audio")
        default: ("wam", "net.whatsapp.movie")
        }
        let copy = FileManager.default.temporaryDirectory.appendingPathComponent("adhx-whatsapp.\(ext)")
        try? FileManager.default.removeItem(at: copy)
        guard (try? FileManager.default.copyItem(at: file, to: copy)) != nil,
              let top = topController() else { return false }
        let controller = UIDocumentInteractionController(url: copy)
        controller.uti = uti
        interaction = controller
        let anchor = CGRect(x: top.view.bounds.midX, y: top.view.bounds.maxY - 80, width: 1, height: 1)
        return controller.presentOpenInMenu(from: anchor, in: top.view, animated: true)
    }

    private static func topController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        var top = scene?.windows.first(where: \.isKeyWindow)?.rootViewController
        while let next = top?.presentedViewController { top = next }
        return top
    }
}
