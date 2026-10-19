import SwiftUI

struct SettingsView: View {
    /// For Shared lately, which opens its posts in the player.
    var library: LibraryModel?
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var confirmDisconnect = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
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
                    Spacer()
                }

                Text("Settings")
                    .font(Theme.serif(40))
                    .foregroundStyle(.white)
                    .accessibilityAddTraits(.isHeader)

                card {
                    row(label: "Your ADHX", value: model.server?.absoluteString ?? "")
                    Divider().overlay(Theme.hairline)
                    if let username = model.username {
                        row(label: "Connected as", value: "@\(username)")
                    } else {
                        row(label: "Connected as", value: "…")
                    }
                }

                if let library {
                    NavigationLink {
                        SharedLatelyView(library: library)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "clock.arrow.circlepath")
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(Theme.accent)
                            Text("Shared lately")
                                .font(Theme.sans(16, .bold))
                                .foregroundStyle(.white)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(Theme.faint)
                        }
                        .padding(16)
                        .frame(minHeight: 56)
                        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.surface))
                    }
                    .accessibilityHint("What you’ve shared from this phone and how each copy is coming along")
                }

                if model.waiting > 0 {
                    card {
                        Text(model.waiting == 1 ? "1 link is waiting to go." : "\(model.waiting) links are waiting to go.")
                            .font(Theme.sans(15, .bold))
                            .foregroundStyle(.white)
                        Text("They go by themselves when your ADHX can be reached.")
                            .font(Theme.sans(13))
                            .foregroundStyle(Theme.muted)
                        Button {
                            Task { await model.sendWaitingNow() }
                        } label: {
                            HStack(spacing: 10) {
                                if model.sending { ProgressView().tint(.black) }
                                Text("Send waiting links now")
                            }
                        }
                        .buttonStyle(PillButtonStyle(kind: .primary, height: 48))
                        .disabled(model.sending)
                        .padding(.top, 4)
                    }
                }

                Button("Disconnect") { confirmDisconnect = true }
                    .buttonStyle(PillButtonStyle(kind: .warn))
                    .padding(.top, 6)

                Text("Disconnecting forgets the key and the list on this phone. Your saves stay on your ADHX. To remove this phone there too, open Settings → Phone app on your ADHX.")
                    .font(Theme.sans(12))
                    .foregroundStyle(Theme.faint)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 24)
        }
        .background(Theme.app.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .confirmationDialog("Disconnect this phone?", isPresented: $confirmDisconnect, titleVisibility: .visible) {
            Button("Disconnect", role: .destructive) { model.disconnect() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your saves stay on your ADHX.")
        }
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) { content() }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.surface))
    }

    private func row(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(Theme.sans(12, .bold))
                .foregroundStyle(Theme.faint)
            Text(value)
                .font(Theme.sans(15, .bold))
                .foregroundStyle(.white)
                .lineLimit(2)
                .textSelection(.enabled)
        }
        .accessibilityElement(children: .combine)
    }
}
