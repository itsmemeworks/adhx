import SwiftUI
import UIKit

/// Connect to your ADHX: scan the code from Settings → Phone app, or type it.
struct ConnectView: View {
    @EnvironmentObject private var model: AppModel
    @State private var typing = false
    @State private var camera = QRScannerView.availability
    @State private var scanNote: String?

    var body: some View {
        // Scrolls once the keyboard leaves too little room, rather than
        // pushing the top under the status bar.
        GeometryReader { geo in
            ScrollView {
                page.frame(maxWidth: .infinity, minHeight: geo.size.height, alignment: .topLeading)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Theme.app.ignoresSafeArea())
        .task {
            if camera == .undetermined {
                camera = await QRScannerView.requestAccess() ? .ready : .denied
            }
        }
    }

    private var page: some View {
        VStack(alignment: .leading, spacing: 22) {
            Wordmark(markSize: 34, textSize: 30)

            VStack(alignment: .leading, spacing: 8) {
                Text("Connect to your ADHX")
                    .font(Theme.serif(40))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Text(typing
                     ? "Type the address of your ADHX and the code from Settings → Phone app."
                     : "On your computer, open your ADHX, go to Settings → Phone app and point the camera at the code.")
                    .font(Theme.sans(15))
                    .foregroundStyle(Theme.muted)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if typing {
                TypeAddressForm()
                Spacer(minLength: 0)
            } else {
                cameraPanel
                statusRow
                Spacer(minLength: 0)
            }

            VStack(spacing: 10) {
                Button(typing ? "Use the camera instead" : "Type the address instead") {
                    model.pairError = nil
                    withAnimation(.easeInOut(duration: 0.2)) { typing.toggle() }
                }
                .buttonStyle(PillButtonStyle(kind: .outline, height: 48, fullWidth: false))

                Text("The app only sends links to your ADHX. Nothing else leaves your phone.")
                    .font(Theme.sans(12))
                    .foregroundStyle(Theme.faint)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 24)
        .padding(.top, 20)
        .padding(.bottom, 16)
    }

    // MARK: Camera

    private var cameraPanel: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 28, style: .continuous).fill(Theme.surface)
            if camera == .ready {
                QRScannerView(paused: model.pairing) { value in scanned(value) }
                    .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                    .accessibilityLabel("Camera view, looking for the code")
            }
            ViewfinderCorners()
                .frame(width: 200, height: 200)
                .accessibilityHidden(true)
        }
        .frame(height: 340)
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var statusRow: some View {
        HStack(spacing: 10) {
            if model.pairing {
                RingSpinner()
                Text("Connecting…").foregroundStyle(Theme.muted)
            } else if let error = model.pairError ?? scanNote {
                Image(systemName: "exclamationmark.circle")
                    .foregroundStyle(Theme.warn)
                Text(error).foregroundStyle(Theme.warn)
            } else {
                switch camera {
                case .ready, .undetermined:
                    RingSpinner()
                    Text("Looking for the code…").foregroundStyle(Theme.muted)
                case .denied:
                    VStack(spacing: 8) {
                        Text("The camera is off for ADHX Share.").foregroundStyle(Theme.muted)
                        Button("Turn it on in Settings") {
                            if let url = URL(string: UIApplication.openSettingsURLString) {
                                UIApplication.shared.open(url)
                            }
                        }
                        .font(Theme.sans(14, .bold))
                        .foregroundStyle(Theme.accent)
                    }
                case .noCamera:
                    Text("There’s no camera here. Type the address instead.")
                        .foregroundStyle(Theme.muted)
                }
            }
        }
        .font(Theme.sans(14))
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    private func scanned(_ value: String) {
        guard !model.pairing else { return }
        guard let url = URL(string: value), let (server, code) = Links.pairing(from: url) else {
            scanNote = "That’s not the code from your ADHX."
            return
        }
        scanNote = nil
        Task { await model.pair(server: server, code: code) }
    }
}

/// The four yellow corners of the viewfinder.
private struct ViewfinderCorners: View {
    var body: some View {
        ZStack {
            corner.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            corner.rotationEffect(.degrees(90))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            corner.rotationEffect(.degrees(-90))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            corner.rotationEffect(.degrees(180))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        }
    }

    private var corner: some View {
        CornerShape()
            .stroke(Theme.accent, style: StrokeStyle(lineWidth: 4, lineCap: .butt))
            .frame(width: 44, height: 44)
    }
}

/// A top-left corner bracket with a 16pt radius, drawn inside its 44pt frame.
private struct CornerShape: Shape {
    func path(in rect: CGRect) -> Path {
        let inset: CGFloat = 2, r: CGFloat = 14
        var p = Path()
        p.move(to: CGPoint(x: rect.minX + inset, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX + inset, y: rect.minY + inset + r))
        p.addArc(center: CGPoint(x: rect.minX + inset + r, y: rect.minY + inset + r), radius: r,
                 startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + inset))
        return p
    }
}

/// Address + 8-character code, for when the camera isn't handy.
private struct TypeAddressForm: View {
    @EnvironmentObject private var model: AppModel
    @State private var address = Store.lastServer ?? ""
    @State private var code = ""
    @FocusState private var focus: Field?

    private enum Field { case address, code }

    private var canConnect: Bool {
        Links.serverURL(from: address) != nil && Links.normalizedCode(code).count == 8 && !model.pairing
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            field(label: "Your ADHX address") {
                TextField("", text: $address, prompt: Text("adhx.example.com").foregroundColor(Theme.faint))
                    .keyboardType(.URL)
                    .textContentType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .focused($focus, equals: .address)
                    .onSubmit { focus = .code }
            }
            field(label: "Code") {
                TextField("", text: $code, prompt: Text("ABCD-EFGH").foregroundColor(Theme.faint))
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(Theme.sans(17, .bold).monospaced())
                    .submitLabel(.go)
                    .focused($focus, equals: .code)
                    .onSubmit(connect)
                    .onChange(of: code) { _, new in
                        let cleaned = formatCode(new)
                        if cleaned != new { code = cleaned }
                    }
            }

            if let error = model.pairError {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Image(systemName: "exclamationmark.circle")
                    Text(error).fixedSize(horizontal: false, vertical: true)
                }
                .font(Theme.sans(14))
                .foregroundStyle(Theme.warn)
            }

            Button(action: connect) {
                HStack(spacing: 10) {
                    if model.pairing { ProgressView().tint(.black) }
                    Text(model.pairing ? "Connecting…" : "Connect")
                }
            }
            .buttonStyle(PillButtonStyle(kind: .primary))
            .disabled(!canConnect)
            .opacity(canConnect || model.pairing ? 1 : 0.45)
        }
        .onAppear { focus = address.isEmpty ? .address : .code }
    }

    private func field<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(Theme.sans(13, .bold))
                .foregroundStyle(Theme.muted)
            content()
                .font(Theme.sans(17))
                .foregroundStyle(Theme.cream)
                .padding(.horizontal, 16)
                .frame(height: 52)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.surface))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Theme.hairline, lineWidth: 1))
        }
    }

    /// Upper case, 8 characters, shown as ABCD-EFGH.
    private func formatCode(_ text: String) -> String {
        let chars = String(Links.normalizedCode(text).prefix(8))
        guard chars.count > 4 else { return chars }
        return String(chars.prefix(4)) + "-" + String(chars.dropFirst(4))
    }

    private func connect() {
        guard canConnect, let server = Links.serverURL(from: address) else { return }
        focus = nil
        Task { await model.pair(server: server, code: code) }
    }
}
