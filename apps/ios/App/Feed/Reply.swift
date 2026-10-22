import SwiftUI

/// Answering a post someone sent you (boards 14.5–14.7). A reply is a
/// reaction on that post: it floats up when they next watch it, and shows in
/// Channels → Reactions, so it needs nothing new on the server.

/// "Reply", beside "Ana sent you this".
struct ReplyButton: View {
    let open: () -> Void

    var body: some View {
        Button("Reply", action: open)
            .font(Theme.sans(14, .heavy))
            .foregroundStyle(.black)
            .padding(.horizontal, 16)
            .frame(height: 40)
            .background(Capsule().fill(Theme.accent))
            .contentShape(Capsule())
            .buttonStyle(.plain)
    }
}

/// "Reply to Ana": an emoji, or a few words back.
struct ReplySheet: View {
    let sender: Saver
    let server: URL
    /// What they said with it, if anything.
    let note: String?
    /// Sends it; true when it went.
    let send: (LiveSay) async -> Bool
    @Environment(\.boardDismiss) private var dismiss
    @State private var words = ""
    @State private var sending = false
    @State private var problem: String?
    @FocusState private var typing: Bool

    private var name: String { sender.displayName }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Face(saver: sender, server: server, size: 40, ring: .clear)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Reply to \(name)")
                        .font(Theme.serif(30))
                        .foregroundStyle(Theme.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text(note.map { "They said: \($0)" } ?? "\(name) sent you this")
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.faint)
                        .lineLimit(1)
                }
            }
            HStack {
                ForEach(LiveSay.quick, id: \.emoji) { quick in
                    Button {
                        Task { await go(.emoji(quick.emoji)) }
                    } label: {
                        Text(quick.emoji)
                            .font(.system(size: 24))
                            .frame(width: 48, height: 48)
                            .background(Circle().fill(Theme.plate))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(quick.name)
                    .disabled(sending)
                    if quick.emoji != LiveSay.quick.last?.emoji { Spacer(minLength: 0) }
                }
            }
            HStack(spacing: 8) {
                TextField("", text: $words, prompt: Text("Say something back").foregroundColor(Theme.faint))
                    .font(Theme.sans(16))
                    .foregroundStyle(Theme.ink)
                    .tint(Theme.accent)
                    .focused($typing)
                    .submitLabel(.send)
                    .onSubmit { Task { await sendWords() } }
                    .onChange(of: words) { _, text in
                        if text.count > LiveSay.maxText { words = String(text.prefix(LiveSay.maxText)) }
                    }
                    .accessibilityLabel("Say something back")
                Button(sending ? "Sending…" : "Send") { Task { await sendWords() } }
                    .font(Theme.sans(14, .heavy))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 16)
                    .frame(height: 40)
                    .background(Capsule().fill(Theme.accent))
                    .buttonStyle(.plain)
                    .disabled(sending || words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(.leading, 16)
            .padding(.trailing, 6)
            .frame(height: 52)
            .background(Capsule().fill(Theme.app))
            .overlay(Capsule().strokeBorder(typing || !words.isEmpty ? Theme.accent.opacity(0.6) : .white.opacity(0.12), lineWidth: 1))
            if let problem {
                Text(problem).font(Theme.sans(13)).foregroundStyle(Theme.warn)
            }
            Text("\(name) sees it on this post, and in Reactions. It floats up when they next watch it.")
                .font(Theme.sans(13))
                .foregroundStyle(Theme.faint)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 24)
    }

    private func sendWords() async {
        let text = words.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        await go(.text(text))
    }

    private func go(_ say: LiveSay) async {
        guard !sending else { return }
        sending = true
        problem = nil
        if await send(say) {
            dismiss?()
        } else {
            sending = false
            problem = "Couldn’t send that. Try again."
        }
    }
}

/// "Pete replied · 2m" over a post you sent or saved, when someone answered.
struct RepliedChip: View {
    let reaction: LiveReactionEvent
    let server: URL

    var body: some View {
        HStack(spacing: 8) {
            Face(saver: reaction.saver, server: server, size: 24, ring: .clear)
            Text(line)
                .font(Theme.sans(13, .bold))
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
        }
        .padding(.leading, 6)
        .padding(.trailing, 12)
        .frame(height: 34)
        .frosted(Capsule(), dim: 0.55)
        .overlay(Capsule().strokeBorder(.white.opacity(0.14), lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    private var line: String {
        let name = reaction.saver.displayName
        let ago = reaction.at.flatMap(Format.parseISO).map { " · " + Format.ago($0) } ?? ""
        if let emoji = reaction.emoji { return "\(name) reacted \(emoji)\(ago)" }
        return "\(name) replied\(ago)"
    }
}
