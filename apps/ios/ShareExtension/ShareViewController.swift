import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// The extension's principal class: a clear, full-screen controller hosting
/// our own SwiftUI sheet (not SLComposeServiceViewController).
@objc(ShareViewController)
final class ShareViewController: UIViewController {
    private let flow = ShareFlow()
    private var finished = false

    override init(nibName nibNameOrNil: String?, bundle nibBundleOrNil: Bundle?) {
        super.init(nibName: nibNameOrNil, bundle: nibBundleOrNil)
        modalPresentationStyle = .overFullScreen
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        modalPresentationStyle = .overFullScreen
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard let window = view.window else { return }
        let screen = window.windowScene?.screen.bounds ?? window.bounds
        let frame = view.convert(view.bounds, to: nil)
        let inCard = frame.minY > 1 || frame.height < screen.height - 1
        if flow.presentedInCard != inCard { flow.presentedInCard = inCard }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        overrideUserInterfaceStyle = .dark
        view.backgroundColor = .clear
        view.isOpaque = false

        flow.onFinish = { [weak self] in self?.finish() }
        flow.onOpen = { [weak self] url in self?.open(url) }

        let host = UIHostingController(rootView: ShareSheetScreen(flow: flow).preferredColorScheme(.dark))
        host.view.backgroundColor = .clear
        host.view.isOpaque = false
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.didMove(toParent: self)

        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        Task { @MainActor in
            let link = await SharedItemReader.firstLink(in: items)
            flow.start(link: link)
        }
    }

    /// Hands back to the system. If the save is still on its way, keep the
    /// process up a little longer so it lands ("You can close this. It carries on").
    private func finish() {
        guard !finished else { return }
        finished = true
        if flow.isSaving {
            let flow = self.flow
            ProcessInfo.processInfo.performExpiringActivity(withReason: "Saving a link to ADHX") { expired in
                guard !expired else { return }
                let done = DispatchSemaphore(value: 0)
                Task { @MainActor in
                    await flow.waitForSave()
                    done.signal()
                }
                _ = done.wait(timeout: .now() + ADHXClient.timeout + 5)
            }
        }
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    /// Share extensions can't call UIApplication.shared; `extensionContext.open`
    /// only works for some extension types, so fall back to the responder chain.
    private func open(_ url: URL) {
        extensionContext?.open(url) { [weak self] opened in
            guard !opened else { return }
            DispatchQueue.main.async { self?.openThroughResponderChain(url) }
        }
    }

    private func openThroughResponderChain(_ url: URL) {
        let selector = NSSelectorFromString("openURL:options:completionHandler:")
        var responder: UIResponder? = self
        while let current = responder {
            if current.isKind(of: NSClassFromString("UIApplication")!), current.responds(to: selector) {
                typealias OpenMethod = @convention(c) (AnyObject, Selector, NSURL, NSDictionary, Any?) -> Void
                let imp = current.method(for: selector)
                let method = unsafeBitCast(imp, to: OpenMethod.self)
                method(current, selector, url as NSURL, NSDictionary(), nil)
                return
            }
            responder = current.next
        }
    }
}

/// Finds the shared link: a URL attachment first, then the first http(s) link in text.
enum SharedItemReader {
    static func firstLink(in items: [NSExtensionItem]) async -> String? {
        let providers = items.flatMap { $0.attachments ?? [] }

        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            if let item = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) {
                if let url = item as? URL, isWeb(url) { return url.absoluteString }
                if let data = item as? Data, let url = URL(dataRepresentation: data, relativeTo: nil), isWeb(url) {
                    return url.absoluteString
                }
                if let text = item as? String, let link = Links.firstLink(in: text) { return link }
            }
        }

        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            if let item = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) {
                if let text = item as? String, let link = Links.firstLink(in: text) { return link }
                if let data = item as? Data, let text = String(data: data, encoding: .utf8),
                   let link = Links.firstLink(in: text) { return link }
                if let url = item as? URL, isWeb(url) { return url.absoluteString }
            }
        }

        // Some apps put the link only in the item's text.
        for item in items {
            if let text = item.attributedContentText?.string, let link = Links.firstLink(in: text) { return link }
        }
        return nil
    }

    private static func isWeb(_ url: URL) -> Bool {
        let scheme = url.scheme?.lowercased()
        return (scheme == "http" || scheme == "https") && url.host != nil
    }
}
