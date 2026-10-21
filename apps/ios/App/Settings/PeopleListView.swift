import SwiftUI

/// Settings → Your people: everyone let in on your ADHX, with their faces and
/// how many of their saves you can see. Tapping someone opens their channel.
struct PeopleListView: View {
    @ObservedObject var settings: SettingsModel
    let server: URL
    @State private var friend: Saver?
    @State private var inviting = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                RoundBackButton(label: "Back to Settings")
                Text("Your people")
                    .font(Theme.serif(36))
                    .foregroundStyle(.white)
                    .accessibilityAddTraits(.isHeader)
                Text("Everyone here sees each other’s saves, except the ones kept just for them.")
                    .font(Theme.sans(14))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)

                if settings.unsupported {
                    Text("Your ADHX needs an update to show this.")
                        .font(Theme.sans(15))
                        .foregroundStyle(Theme.muted)
                } else if let error = settings.loadError, settings.people == nil {
                    Text(error)
                        .font(Theme.sans(15))
                        .foregroundStyle(Theme.warn)
                        .fixedSize(horizontal: false, vertical: true)
                } else if settings.people == nil {
                    HStack { Spacer(); RingSpinner(size: 34, lineWidth: 3); Spacer() }
                        .padding(.top, 20)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(shown.enumerated()), id: \.element.id) { index, person in
                            if index > 0 { Rectangle().fill(.white.opacity(0.06)).frame(height: 1) }
                            row(person)
                        }
                    }
                    .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Theme.surface))
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                }

                if settings.people?.canInvite == true {
                    Button("Invite someone") { inviting = true }
                        .buttonStyle(PillButtonStyle(kind: .outline, height: 48))
                        .padding(.top, 4)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .refreshable { await settings.load() }
        .background(Theme.app.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .inviteSheet(isPresented: $inviting)
        .fullScreenCover(item: $friend) { saver in
            FriendChannelScreen(friend: saver, server: server)
        }
    }

    /// You first, then everyone else; banned members (admins only) last.
    private var shown: [Person] {
        let all = settings.people?.members ?? []
        return all.filter { !$0.banned } + all.filter(\.banned)
    }

    private func row(_ person: Person) -> some View {
        let opens = !person.isYou && !person.banned
        return Button {
            if opens { friend = person.face }
        } label: {
            HStack(spacing: 12) {
                Face(saver: person.face, server: server, size: 44, ring: Theme.surface)
                    .opacity(person.banned ? 0.5 : 1)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(person.shownName)
                            .font(Theme.sans(15, .heavy))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        if let chip = chip(person) {
                            Text(chip)
                                .font(Theme.sans(11, .heavy))
                                .foregroundStyle(person.banned ? Theme.warn : Theme.faint)
                                .padding(.horizontal, 7)
                                .frame(minHeight: 20)
                                .overlay(Capsule().strokeBorder(person.banned ? Theme.warn : Theme.hairline,
                                                                lineWidth: 1))
                        }
                    }
                    Text(detail(person))
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.faint)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if opens {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Theme.faint)
                }
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 68)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint(opens ? "Opens \(person.shownName)’s saves" : "")
    }

    private func chip(_ person: Person) -> String? {
        if person.banned { return "Banned" }
        if person.isYou { return "You" }
        switch person.role {
        case "owner": return "Owner"
        case "admin": return "Admin"
        default: return nil
        }
    }

    /// "@ana · 214 saves · 2h ago".
    private func detail(_ person: Person) -> String {
        var parts = ["@\(person.username)", person.saves == 1 ? "1 save" : "\(person.saves) saves"]
        if let last = Format.date(person.lastSavedAt) {
            let ago = Format.shortAgo(last)
            parts.append(ago == "now" ? "saved just now" : "last \(ago) ago")
        }
        return parts.joined(separator: " · ")
    }
}
