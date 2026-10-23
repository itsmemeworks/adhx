import SwiftUI

// MARK: - The picker

/// Six quick emoji and a few words: Live's picker, and React on any post.
struct ReactPicker: View {
    @Binding var words: String
    var typing: FocusState<Bool>.Binding
    let sending: Bool
    /// The last one didn't go: the button says Retry.
    var retrying = false
    var note: String?
    var prompt = "Say something"
    var hint = "Up to \(LiveSay.maxText) characters"
    /// Under the picker (board 11.1): where what you say goes.
    var footnote: String? = "Kept on the post. Your people see it when they watch."
    let onEmoji: (String) -> Void
    let onWords: () -> Void
    @State private var height: CGFloat = 126

    var body: some View {
      ScrollView {
        VStack(spacing: 10) {
            ScrollView(.horizontal, showsIndicators: false) {
              HStack(spacing: 0) {
                ForEach(Array(LiveSay.quick.enumerated()), id: \.element.emoji) { index, quick in
                    if index > 0 { Spacer(minLength: 8) }
                    Button {
                        onEmoji(quick.emoji)
                    } label: {
                        Text(quick.emoji)
                            .font(.system(size: 26))
                            .frame(width: 48, height: 48)
                            .background(Circle().fill(Theme.plate))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(quick.name)
                }
              }
              .containerRelativeFrame(.horizontal)
            }
            .disabled(sending)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Quick reactions")
            HStack(spacing: 8) {
                TextField("", text: $words, prompt: Text(prompt).foregroundColor(Theme.inkFaint))
                    .font(Theme.sans(15, .medium))
                    .foregroundStyle(Theme.ink)
                    .focused(typing)
                    .submitLabel(.send)
                    .onSubmit(onWords)
                    .onChange(of: words) { _, text in
                        if text.unicodeScalars.count > LiveSay.maxText { words = LiveSay.clip(text) }
                    }
                    .padding(.horizontal, 16)
                    .frame(height: 44)
                    // 26 − 12 inset − 1 border: follows the picker's curve.
                    .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(Theme.bg))
                    .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .strokeBorder(Theme.line, lineWidth: 1))
                    .accessibilityLabel("Say something")
                    .accessibilityHint(hint)
                Button(sending ? "Sending…" : (retrying ? "Retry" : "Send"), action: onWords)
                    .buttonStyle(PillButtonStyle(kind: .primary, height: 44, fullWidth: false, fontSize: 15,
                                                 cornerRadius: 13))
                    .disabled(sending || words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            if let note {
                Text(note)
                    .font(Theme.sans(13, .bold))
                    .foregroundStyle(Theme.warn)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityAddTraits(.updatesFrequently)
            } else if let footnote {
                Text(footnote)
                    .font(Theme.sans(12))
                    .foregroundStyle(Theme.inkFaint)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(12)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
      }
        // As tall as what's in it, scrolling only past 300 (very large text).
        .frame(height: min(max(height, 1), 300))
        .scrollBounceBehavior(.basedOnSize)
        .background {
            let shape = RoundedRectangle(cornerRadius: 26, style: .continuous)
            shape.fill(.ultraThinMaterial)
                .overlay(shape.fill(Theme.surface.opacity(0.88)))
                .overlay(shape.strokeBorder(.white.opacity(0.1), lineWidth: 1))
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("React")
    }
}

// MARK: - Floating reactions

/// One reaction on its way up the screen.
struct FloatingReaction: Identifiable, Equatable {
    let id = UUID()
    let event: LiveReactionEvent
    /// Where across the screen it rises, 0…1.
    let lane: CGFloat
    /// The face is the main thing: 44–56 pt.
    var size: CGFloat = .random(in: 44...56)

    static let lifeNanos: UInt64 = 3_600_000_000
}

/// Reactions rising and fading, each with the face of who sent it. Under
/// Reduce Motion they stay put and just fade.
struct FloatingReactions: View {
    let reactions: [FloatingReaction]
    let server: URL
    @State private var lastSpoken = Date.distantPast

    var body: some View {
        GeometryReader { box in
            ZStack(alignment: .bottomLeading) {
                ForEach(reactions) { reaction in
                    Bubble(reaction: reaction, server: server, rise: box.size.height * 0.8)
                        // Words are wider than a face: they keep to the left, on screen.
                        .offset(x: reaction.lane * max(box.size.width - (reaction.event.text == nil ? 120 : 300), 0))
                }
            }
            .frame(width: box.size.width, height: box.size.height, alignment: .bottomLeading)
        }
        .accessibilityHidden(true)
        .onChange(of: reactions.last?.id) { _, _ in announce() }
    }

    /// VoiceOver hears them, but not a flood of them.
    private func announce() {
        guard UIAccessibility.isVoiceOverRunning, let last = reactions.last,
              Date().timeIntervalSince(lastSpoken) > 3 else { return }
        lastSpoken = Date()
        let what = last.event.text ?? LiveSay.quick.first(where: { $0.emoji == last.event.emoji })?.name
            ?? last.event.emoji ?? ""
        UIAccessibility.post(notification: .announcement, argument: "\(last.event.saver.displayName): \(what)")
    }

    private struct Bubble: View {
        let reaction: FloatingReaction
        let server: URL
        let rise: CGFloat
        @Environment(\.accessibilityReduceMotion) private var reduceMotion
        @State private var up = false
        @State private var gone = false

        var body: some View {
            content
                .offset(y: up && !reduceMotion ? -rise : 0)
                .scaleEffect(up && !reduceMotion ? 1 : 0.85, anchor: .bottomLeading)
                .opacity(gone ? 0 : 1)
                .onAppear {
                    let seconds = Double(FloatingReaction.lifeNanos) / 1_000_000_000 - 0.2
                    if !reduceMotion {
                        withAnimation(.easeOut(duration: seconds)) { up = true }
                    }
                    // Whole for most of the rise, then fading (the boards' faces are solid mid-way).
                    withAnimation(.easeIn(duration: seconds * 0.4).delay(seconds * 0.6)) { gone = true }
                }
        }

        /// Their face, ringed in their colour (a black gap, then the colour).
        private func ringedFace(_ size: CGFloat) -> some View {
            let saver = reaction.event.saver
            return Face(saver: saver, server: server, size: size, ring: .clear)
                .padding(3)
                .background(GobShape().fill(.black))
                .padding(2)
                .background(GobShape().fill(Face.colour(for: saver.username)))
        }

        @ViewBuilder
        private var content: some View {
            let saver = reaction.event.saver
            if let text = reaction.event.text {
                // The face, and their words in the serif on a rounded bubble in their colour.
                HStack(alignment: .bottom, spacing: 8) {
                    ringedFace(44)
                    Text(text)
                        .font(Theme.serif(20))
                        .foregroundStyle(.black)
                        .lineLimit(3)
                        .lineSpacing(-2)
                        .padding(.horizontal, 13)
                        .padding(.top, 6)
                        .padding(.bottom, 7)
                        .background(RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(Face.colour(for: saver.username)))
                        .frame(maxWidth: 230, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 18)
                }
            } else if let emoji = reaction.event.emoji {
                // The face first; the emoji is a sticker on its corner.
                ringedFace(reaction.size)
                    .overlay(alignment: .bottomTrailing) {
                        Text(emoji)
                            .font(.system(size: reaction.size * 0.6))
                            .offset(x: reaction.size * 0.27, y: reaction.size * 0.22)
                    }
                    .fixedSize()
            }
        }
    }
}

// MARK: - Reactions on any post
