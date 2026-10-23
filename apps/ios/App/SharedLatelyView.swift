import SwiftUI
import UIKit

/// Shared lately: the connection, recent shares and how their copies are
/// coming along. A row opens that post in the player.
struct SharedLatelyView: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject var library: LibraryModel
    @Environment(\.dismiss) private var dismiss
    @State private var playing: PhonePost?
    @State private var opening: String?
    /// Why a row didn't open (still on its way, or gone).
    @State private var note: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 10) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(Theme.surface))
                }
                .accessibilityLabel("Back")
                Spacer(minLength: 0)
            }

            ConnectionPill(host: Links.displayHost(model.server), state: model.connection)

            Text("Shared lately")
                .font(Theme.serif(40))
                .foregroundStyle(.white)
                .accessibilityAddTraits(.isHeader)

            if model.records.isEmpty {
                EmptyShares()
                Spacer(minLength: 0)
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(model.records) { record in
                            ShareRow(record: record, opening: opening == record.id) {
                                Task { await open(record) }
                            }
                        }
                    }
                    .padding(.bottom, 8)
                }
                .scrollIndicators(.hidden)
                .refreshable { await model.refresh() }
            }

            if let note {
                Text(note)
                    .font(Theme.sans(13, .bold))
                    .foregroundStyle(Theme.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 12)
        .background(Theme.bg.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .fullScreenCover(item: $playing) { post in
            if let server = model.server {
                PlayerScreen(posts: [post], server: server, start: post.key)
            }
        }
    }

    /// In the player, once it's in your saves.
    private func open(_ record: ShareRecord) async {
        note = nil
        guard let platform = record.platform, let id = record.postId else {
            note = "That one’s still on its way. It opens here once it’s saved."
            return
        }
        opening = record.id
        let post = await library.post(platform: platform, id: id)
        opening = nil
        if let post {
            playing = post
        } else {
            note = record.stage == .saved
                ? "That one won’t open right now. Try again in a bit."
                : "That one’s still on its way. It opens here once it’s ready."
        }
        if let note { UIAccessibility.post(notification: .announcement, argument: note) }
    }
}

extension PhonePost: Identifiable {
    var id: String { key }
}

struct ConnectionPill: View {
    let host: String
    let state: AppModel.Connection

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(dot)
                .frame(width: 8, height: 8)
            Text("\(host) · \(word)")
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .font(Theme.sans(13, .bold))
        .foregroundStyle(Theme.inkSoft)
        .padding(.vertical, 8)
        .padding(.horizontal, 14)
        .background(Capsule(style: .continuous).fill(Theme.surface))
        .accessibilityElement(children: .combine)
    }

    private var dot: Color {
        switch state {
        case .connected: return Theme.good
        case .checking: return Theme.inkFaint
        case .unreachable: return Theme.warn
        }
    }

    private var word: String {
        switch state {
        case .connected: return "connected"
        case .checking: return "checking…"
        case .unreachable: return "can’t reach it"
        }
    }
}

private struct ShareRow: View {
    let record: ShareRecord
    var opening = false
    let open: () -> Void

    var body: some View {
        let (status, tone) = Format.statusLine(record)
        Button(action: open) {
            HStack(spacing: 12) {
                // 18 − 12 inset is under 8, so 8: follows the row's curve.
                NetworkTile(platform: record.platform, cornerRadius: 8)
                VStack(alignment: .leading, spacing: 3) {
                    Text(Format.title(record))
                        .font(Theme.sans(15, .bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(status)
                        .font(Theme.sans(12))
                        .foregroundStyle(tone.color)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if opening {
                    RingSpinner().frame(width: 18, height: 18)
                } else {
                    TimelineView(.periodic(from: .now, by: 30)) { context in
                        Text(Format.ago(record.createdAt, now: context.date))
                            .font(Theme.sans(12))
                            .foregroundStyle(Theme.inkFaint)
                    }
                }
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 14)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.surface))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(record.postId == nil)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(Network.name(record.platform)), \(Format.title(record)), \(status)")
    }
}

struct EmptyShares: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Nothing shared from this phone yet.")
                .font(Theme.sans(17, .heavy))
                .foregroundStyle(.white)
            Text("In any app, tap Share on a post and pick ADHX. It shows up here. Everything you’ve saved is in the player.")
                .font(Theme.sans(15))
                .foregroundStyle(Theme.inkSoft)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.surface))
    }
}
