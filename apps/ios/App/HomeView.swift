import SwiftUI

/// Shared lately: the connection, recent shares and how their copies are coming along.
struct HomeView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 10) {
                Wordmark()
                Spacer(minLength: 0)
                NavigationLink {
                    SettingsView()
                } label: {
                    Image(systemName: "gearshape")
                        .font(.system(size: 19, weight: .medium))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(Theme.surface))
                }
                .accessibilityLabel("Settings")
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
                            ShareRow(record: record) {
                                if let url = model.openURL(for: record) { openURL(url) }
                            }
                        }
                    }
                    .padding(.bottom, 8)
                }
                .scrollIndicators(.hidden)
                .refreshable { await model.refresh() }
            }

            Button("Open my ADHX") {
                if let server = model.server { openURL(server) }
            }
            .buttonStyle(PillButtonStyle(kind: .primary))
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 12)
        .background(Theme.app.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { model.startPolling() }
        .onDisappear { model.stopPolling() }
    }
}

private struct ConnectionPill: View {
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
        .foregroundStyle(Theme.muted)
        .padding(.vertical, 8)
        .padding(.horizontal, 14)
        .background(Capsule().fill(Theme.surface))
        .accessibilityElement(children: .combine)
    }

    private var dot: Color {
        switch state {
        case .connected: return Theme.good
        case .checking: return Theme.faint
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
    let open: () -> Void

    var body: some View {
        let (status, tone) = Format.statusLine(record)
        Button(action: open) {
            HStack(spacing: 12) {
                NetworkTile(platform: record.platform)
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
                TimelineView(.periodic(from: .now, by: 30)) { context in
                    Text(Format.ago(record.createdAt, now: context.date))
                        .font(Theme.sans(12))
                        .foregroundStyle(Theme.faint)
                }
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 14)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.surface))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(record.openPath == nil)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(Network.name(record.platform)), \(Format.title(record)), \(status)")
    }
}

private struct EmptyShares: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Nothing yet.")
                .font(Theme.sans(17, .heavy))
                .foregroundStyle(.white)
            Text("In any app, tap Share on a post and pick ADHX. It shows up here.")
                .font(Theme.sans(15))
                .foregroundStyle(Theme.muted)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.surface))
    }
}
