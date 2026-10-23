import SwiftUI
import UIKit

/// Your invite links (`/api/app/invites`): make one and send it with the
/// system share sheet, see the ones still waiting, revoke them.
@MainActor
final class InvitesModel: ObservableObject {
    @Published private(set) var invites: [Invite] = []
    @Published private(set) var loadedOnce = false
    @Published private(set) var unsupported = false
    @Published private(set) var making = false
    @Published private(set) var revoking: String?
    @Published var problem: String?

    /// Links made on this phone this time: the list only has them once.
    private var links: [String: String] = [:]

    var onBadKey: () -> Void = {}

    func link(for invite: Invite) -> URL? {
        (invite.url ?? links[invite.id]).flatMap(URL.init(string:))
    }

    func load() async {
        guard let client = Store.client() else { return }
        do {
            invites = try await client.invites()
            unsupported = false
        } catch APIError.badKey {
            onBadKey()
        } catch let error as APIError where error.isMissing {
            unsupported = true
        } catch is CancellationError {
            return
        } catch let error as APIError {
            if invites.isEmpty { problem = error.message }
        } catch {
            if invites.isEmpty { problem = APIError.offline.message }
        }
        loadedOnce = true
    }

    /// A new link, to share at once.
    func make() async -> URL? {
        guard !making, let client = Store.client() else { return nil }
        making = true
        problem = nil
        defer { making = false }
        do {
            let made = try await client.makeInvite()
            if let url = made.url { links[made.id] = url }
            invites.removeAll { $0.id == made.id }
            invites.insert(Invite(id: made.id, url: made.url, createdAt: made.createdAt ?? Date(),
                                  expiresAt: made.expiresAt, uses: made.uses), at: 0)
            Task { await load() }
            guard let url = link(for: made) else {
                problem = "Your ADHX made the invite but didn’t send its link. Try again."
                return nil
            }
            return url
        } catch APIError.badKey {
            onBadKey()
        } catch let error as APIError where error.isMissing {
            unsupported = true
        } catch let error as APIError {
            problem = error.message
        } catch {
            problem = "That didn’t go through. Try again."
        }
        return nil
    }

    func revoke(_ invite: Invite) async {
        guard revoking == nil, let client = Store.client() else { return }
        revoking = invite.id
        problem = nil
        defer { revoking = nil }
        do {
            try await client.revokeInvite(invite.id)
            invites.removeAll { $0.id == invite.id }
            links[invite.id] = nil
        } catch APIError.badKey {
            onBadKey()
        } catch let error as APIError where error.isMissing {
            // Already gone: show what's true now.
            invites.removeAll { $0.id == invite.id }
            await load()
        } catch let error as APIError {
            problem = error.message
        } catch {
            problem = "That didn’t go through. Try again."
        }
    }
}

/// A link for the system share sheet.
struct SharedLink: Identifiable {
    let url: URL
    var id: URL { url }
}

extension View {
    /// "Invite someone": makes a link and opens the share sheet, and lists the
    /// links still waiting.
    func inviteSheet(isPresented: Binding<Bool>, onBadKey: @escaping () -> Void = {}) -> some View {
        modifier(InviteSheetHost(isPresented: isPresented, onBadKey: onBadKey))
    }
}

private struct InviteSheetHost: ViewModifier {
    @Binding var isPresented: Bool
    let onBadKey: () -> Void
    @StateObject private var model = InvitesModel()
    @State private var sharing: SharedLink?

    func body(content: Content) -> some View {
        content
            .boardSheet(isPresented: $isPresented, height: 640) {
                InviteSheet(model: model) { url in sharing = SharedLink(url: url) }
                    .task {
                        model.onBadKey = onBadKey
                        await model.load()
                    }
            }
            .sheet(item: $sharing) { link in
                ActivitySheet(items: [link.url])
                    .presentationDetents([.medium, .large])
            }
    }
}

private struct InviteSheet: View {
    @ObservedObject var model: InvitesModel
    let share: (URL) -> Void
    @State private var confirming: Invite?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Invite someone")
                    .font(Theme.serif(32))
                    .foregroundStyle(.white)
                    .accessibilityAddTraits(.isHeader)
                Text("Anyone with this link can ask to join. Nobody gets in until you say yes.")
                    .font(Theme.sans(14))
                    .foregroundStyle(Theme.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if model.unsupported {
                Text("Your ADHX needs an update before the app can make invites.")
                    .font(Theme.sans(14))
                    .foregroundStyle(Theme.warn)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Button {
                    Task { if let url = await model.make() { share(url) } }
                } label: {
                    HStack(spacing: 10) {
                        if model.making { ProgressView().tint(.black) }
                        Text(model.making ? "Making a link…" : "Make a link and send it")
                    }
                }
                .buttonStyle(PillButtonStyle(kind: .primary))
                .disabled(model.making)
            }

            if let problem = model.problem {
                Text(problem)
                    .font(Theme.sans(13, .bold))
                    .foregroundStyle(Theme.warn)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !model.unsupported { links }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 24)
        .onChange(of: model.problem) { _, problem in
            if let problem { UIAccessibility.post(notification: .announcement, argument: problem) }
        }
        .confirmationDialog("Revoke this link?", isPresented: Binding(
            get: { confirming != nil }, set: { if !$0 { confirming = nil } }),
                            titleVisibility: .visible, presenting: confirming) { invite in
            Button("Revoke", role: .destructive) { Task { await model.revoke(invite) } }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("It stops working at once. Anyone already waiting stays waiting.")
        }
    }

    @ViewBuilder
    private var links: some View {
        if !model.loadedOnce {
            HStack { Spacer(); RingSpinner(size: 26, lineWidth: 2.5); Spacer() }
                .padding(.top, 6)
        } else if model.invites.isEmpty {
            Text("No links waiting.")
                .font(Theme.sans(14))
                .foregroundStyle(Theme.inkFaint)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Text("YOUR LINKS")
                    .font(Theme.sans(12, .heavy))
                    .tracking(0.7)
                    .foregroundStyle(Theme.inkFaint)
                    .accessibilityAddTraits(.isHeader)
                VStack(spacing: 0) {
                    ForEach(Array(model.invites.enumerated()), id: \.element.id) { index, invite in
                        if index > 0 { Rectangle().fill(.white.opacity(0.06)).frame(height: 1) }
                        row(invite)
                    }
                }
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Theme.plate))
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
        }
    }

    private func row(_ invite: Invite) -> some View {
        let busy = model.revoking == invite.id
        let link = model.link(for: invite)
        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title(invite))
                    .font(Theme.sans(15, .bold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Text(detail(invite))
                    .font(Theme.sans(12))
                    .foregroundStyle(Theme.inkFaint)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            if let link {
                Button { share(link) } label: {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Send this link")
            }
            Button {
                confirming = invite
            } label: {
                if busy {
                    RingSpinner(size: 16, lineWidth: 2).frame(width: 64, height: 44)
                } else {
                    Text("Revoke")
                        .font(Theme.sans(13, .bold))
                        .foregroundStyle(Theme.danger)
                        .frame(minWidth: 64, minHeight: 44)
                        .contentShape(Rectangle())
                }
            }
            .buttonStyle(.plain)
            .disabled(model.revoking != nil)
        }
        .padding(.leading, 16)
        .padding(.trailing, 8)
        .padding(.vertical, 4)
    }

    /// "Made 2d ago", "Made just now".
    private func title(_ invite: Invite) -> String {
        guard let made = invite.createdAt else { return "An invite link" }
        let ago = Format.shortAgo(made)
        return ago == "now" ? "Made just now" : "Made \(ago) ago"
    }

    /// "Works for 6 more days · used once".
    private func detail(_ invite: Invite) -> String {
        var parts = [invite.lifeLine()]
        if invite.uses == 1 { parts.append("used once") } else if invite.uses > 1 { parts.append("used \(invite.uses) times") }
        if model.link(for: invite) == nil { parts.append("its link was shown once, when it was made") }
        return parts.joined(separator: " · ")
    }
}
