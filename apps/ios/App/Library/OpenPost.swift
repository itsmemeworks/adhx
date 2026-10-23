import SwiftUI
import UIKit

extension Notification.Name {
    /// A post opened by "Open in ADHX" is about to play: players under it pause.
    static let adhxOpeningPost = Notification.Name("adhx.openingPost")
    /// That post's player has closed.
    static let adhxOpenedPostClosed = Notification.Name("adhx.openedPostClosed")
}

/// "Open in ADHX" on the share card (and a post picked from Why): the post
/// plays at once, over whatever the app was left on: a player, a sheet, a
/// channel. SwiftUI can't put a second full-screen player over one already
/// up (and a screen under one hears nothing), so this presents it from the
/// top screen; closing it goes back there.
@MainActor
enum OpenPostPresenter {
    static func present(_ ref: PostRef, server: URL, model: AppModel, tries: Int = 10) {
        // On a cold start the link can come before the first screen is up,
        // and a sheet may still be on its way down: try again shortly.
        guard let top = topController(), top.view.window != nil, !top.isBeingPresented else {
            guard tries > 0 else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                present(ref, server: server, model: model, tries: tries - 1)
            }
            return
        }
        // Already playing this one on top.
        if let shown = top as? OpenedPostHost, shown.ref == ref { return }
        NotificationCenter.default.post(name: .adhxOpeningPost, object: ref.key)
        let host = OpenedPostHost(ref: ref)
        host.rootView = AnyView(
            OpeningPlayer(ref: ref, server: server) { [weak host] in
                host?.dismiss(animated: true)
            }
            .environmentObject(model)
        )
        host.modalPresentationStyle = .fullScreen
        top.present(host, animated: true)
    }

    private static func topController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        var top = scene?.windows.first(where: \.isKeyWindow)?.rootViewController
            ?? scene?.windows.first?.rootViewController
        while let next = top?.presentedViewController, !next.isBeingDismissed { top = next }
        return top
    }
}

final class OpenedPostHost: UIHostingController<AnyView> {
    let ref: PostRef

    init(ref: PostRef) {
        self.ref = ref
        super.init(rootView: AnyView(EmptyView()))
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || presentingViewController == nil {
            NotificationCenter.default.post(name: .adhxOpenedPostClosed, object: ref.key)
        }
    }
}

/// Black with a spinner for the moment it takes to fetch the post, then the
/// player on it, looping (you came to watch this one). A save that has only
/// just landed may need a second ask.
private struct OpeningPlayer: View {
    let ref: PostRef
    let server: URL
    let close: () -> Void
    @State private var post: PhonePost?
    @State private var missing = false

    var body: some View {
        if let post {
            PlayerScreen(posts: [post], server: server, start: post.key, onClose: close, startRepeating: true)
        } else {
            ZStack(alignment: .topLeading) {
                Theme.stage.ignoresSafeArea()
                VStack(spacing: 14) {
                    if missing {
                        Text("That post isn’t in your saves yet.")
                            .font(Theme.sans(16, .semibold))
                            .foregroundStyle(Theme.ink)
                        Text("Give it a moment and open it from Shared lately.")
                            .font(Theme.sans(14))
                            .foregroundStyle(Theme.inkSoft)
                    } else {
                        RingSpinner().frame(width: 34, height: 34)
                    }
                }
                .multilineTextAlignment(.center)
                .padding(32)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                Button(action: close) {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 44, height: 44)
                        .frosted(Circle(), dim: 0.45)
                }
                .accessibilityLabel("Close")
                .padding(.horizontal, 16)
                .padding(.top, 4)
            }
            .task(id: ref) {
                for wait: UInt64 in [0, 1, 2, 3] {
                    if wait > 0 { try? await Task.sleep(nanoseconds: wait * 1_000_000_000) }
                    guard !Task.isCancelled else { return }
                    if let found = try? await Store.client()?.post(platform: ref.platform, id: ref.id) {
                        post = found
                        return
                    }
                }
                missing = true
            }
        }
    }
}
