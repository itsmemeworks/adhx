import SwiftUI
import UIKit

/// Sign in with email: your ADHX's address and your email, then the 6-digit
/// code it sends (`/api/app/signin`, `/api/app/signin/verify`). Connects
/// this phone the same way pairing does.
struct EmailSignInForm: View {
    @EnvironmentObject private var model: AppModel
    @State private var address = Store.lastServer ?? ""
    @State private var email = ""
    @State private var code = ""
    /// The code is on its way to this address (on this server).
    @State private var sentTo: (server: URL, email: String)?
    @State private var sentAt: Date?
    @FocusState private var focus: Field?

    private enum Field { case address, email, code }

    static let resendAfter: TimeInterval = 60

    private var canSend: Bool {
        Links.serverURL(from: address) != nil && SignInWords.looksLikeEmail(email) && !model.pairing
    }

    private var canVerify: Bool { SignInWords.code(code).count == 6 && !model.pairing }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let sentTo {
                codeStep(sentTo)
            } else {
                emailStep
            }
        }
        .onAppear { focus = address.isEmpty ? .address : .email }
    }

    // MARK: Email

    private var emailStep: some View {
        Group {
            field(label: "Your ADHX address") {
                TextField("Your ADHX address", text: $address, prompt: Text("adhx.example.com").foregroundColor(Theme.inkFaint))
                    .accessibilityLabel("Your ADHX address")
                    .keyboardType(.URL)
                    .textContentType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .focused($focus, equals: .address)
                    .onSubmit { focus = .email }
            }
            field(label: "Your email") {
                TextField("Your email", text: $email, prompt: Text("you@example.com").foregroundColor(Theme.inkFaint))
                    .accessibilityLabel("Your email")
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.send)
                    .focused($focus, equals: .email)
                    .onSubmit(send)
            }
            errorLine
            Button(action: send) {
                HStack(spacing: 10) {
                    if model.pairing { ProgressView().tint(.black) }
                    Text(model.pairing ? "Sending…" : "Send me a code")
                }
            }
            .buttonStyle(PillButtonStyle(kind: .primary))
            .disabled(!canSend)
            .opacity(canSend || model.pairing ? 1 : 0.45)
        }
    }

    // MARK: Code

    private func codeStep(_ sent: (server: URL, email: String)) -> some View {
        Group {
            VStack(alignment: .leading, spacing: 4) {
                Text("Check your email for a 6-digit code")
                    .font(Theme.sans(17, .heavy))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Text("We sent it to \(sent.email), if it has an account on \(Links.displayHost(sent.server)). It works for 15 minutes.")
                    .font(Theme.sans(14))
                    .foregroundStyle(Theme.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            field(label: "Code") {
                TextField("", text: $code, prompt: Text("123456").foregroundColor(Theme.inkFaint.opacity(0.55)))
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .font(Theme.sans(22, .bold).monospaced())
                    .focused($focus, equals: .code)
                    .onChange(of: code) { _, new in
                        let cleaned = SignInWords.code(new)
                        if cleaned != new { code = cleaned }
                        // Autofilled or pasted whole: go at once.
                        if cleaned.count == 6, !model.pairing { verify() }
                    }
                    .accessibilityLabel("6-digit code")
            }
            errorLine
            Button(action: verify) {
                HStack(spacing: 10) {
                    if model.pairing { ProgressView().tint(.black) }
                    Text(model.pairing ? "Connecting…" : "Connect")
                }
            }
            .buttonStyle(PillButtonStyle(kind: .primary))
            .disabled(!canVerify)
            .opacity(canVerify || model.pairing ? 1 : 0.45)

            TimelineView(.periodic(from: .now, by: 1)) { context in
                let wait = max(0, Int(Self.resendAfter - context.date.timeIntervalSince(sentAt ?? .distantPast)))
                HStack(spacing: 16) {
                    Button(wait > 0 ? "Send another in \(wait)s" : "Send another code") { resend(sent) }
                        .disabled(wait > 0 || model.pairing)
                        .foregroundStyle(wait > 0 ? Theme.inkFaint : Theme.accent)
                    Button("Use another email") {
                        model.pairError = nil
                        code = ""
                        sentTo = nil
                        focus = .email
                    }
                    .foregroundStyle(Theme.accent)
                }
                .font(Theme.sans(14, .bold))
                .buttonStyle(.plain)
                .frame(minHeight: 44)
            }
        }
    }

    @ViewBuilder
    private var errorLine: some View {
        if let error = model.pairError {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: "exclamationmark.circle")
                Text(error).fixedSize(horizontal: false, vertical: true)
            }
            .font(Theme.sans(14))
            .foregroundStyle(Theme.warn)
            .accessibilityElement(children: .combine)
        }
    }

    private func field<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(Theme.sans(13, .bold))
                .foregroundStyle(Theme.inkSoft)
            content()
                .font(Theme.sans(17))
                .foregroundStyle(Theme.cream)
                .padding(.horizontal, 16)
                .frame(height: 52)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.surface))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Theme.line, lineWidth: 1))
        }
    }

    // MARK: Actions

    private func send() {
        guard canSend, let server = Links.serverURL(from: address) else { return }
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        focus = nil
        Task {
            if await model.requestCode(server: server, email: email) {
                sentTo = (server, email)
                sentAt = Date()
                code = ""
                focus = .code
                UIAccessibility.post(notification: .announcement, argument: "Check your email for a 6-digit code")
            }
        }
    }

    private func resend(_ sent: (server: URL, email: String)) {
        Task {
            if await model.requestCode(server: sent.server, email: sent.email) {
                sentAt = Date()
                code = ""
                focus = .code
            }
        }
    }

    private func verify() {
        guard canVerify, let sent = sentTo else { return }
        focus = nil
        Task {
            await model.verifyCode(server: sent.server, email: sent.email, code: code)
            if model.pairError != nil { focus = .code }
        }
    }
}
