import SwiftUI

/// Search your saves by meaning: words, pictures and what's in videos. Tapping
/// a result plays the results from there.
struct SearchView: View {
    @ObservedObject var library: LibraryModel
    let server: URL
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focused: Bool
    @State private var playing: PlayerStart?

    private static let prompts = [
        "that video with the squirrel",
        "something about being tired after work",
        "tiny animations that make an app feel nicer",
        "a synth you play by typing",
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(Theme.faint)
                    TextField(
                        "",
                        text: $library.query,
                        prompt: Text("Describe what you’re looking for").foregroundColor(Theme.faint)
                    )
                    .font(Theme.sans(16))
                    .foregroundStyle(.white)
                    .focused($focused)
                    .submitLabel(.search)
                    .onSubmit { library.searchNow() }
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    if !library.query.isEmpty {
                        Button {
                            library.query = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.faint)
                        }
                        .accessibilityLabel("Clear")
                    }
                }
                .padding(.horizontal, 14)
                .frame(height: 48)
                .background(Capsule().fill(Theme.surface))

                Button("Cancel") { dismiss() }
                    .font(Theme.sans(15, .bold))
                    .foregroundStyle(Theme.cream)
            }

            content
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .background(Theme.app.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { focused = library.query.isEmpty }
        .fullScreenCover(item: $playing) { start in
            PlayerScreen(posts: library.results, server: server, start: start.key)
        }
    }

    @ViewBuilder
    private var content: some View {
        if library.query.trimmingCharacters(in: .whitespaces).isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("TRY DESCRIBING")
                    .font(Theme.sans(12, .heavy))
                    .foregroundStyle(Theme.faint)
                ForEach(Self.prompts, id: \.self) { prompt in
                    Button {
                        library.query = prompt
                        library.searchNow()
                        focused = false
                    } label: {
                        Text(prompt)
                            .font(Theme.sans(16))
                            .foregroundStyle(Theme.cream)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 6)
                    }
                }
            }
            Spacer(minLength: 0)
        } else if let error = library.searchError {
            Note(text: error)
            Spacer(minLength: 0)
        } else if library.results.isEmpty {
            if library.searching || !library.searched {
                HStack { Spacer(); RingSpinner().frame(width: 30, height: 30); Spacer() }
                    .padding(.top, 40)
            } else {
                Note(text: "Nothing in your saves matches that yet. Try describing it another way.")
            }
            Spacer(minLength: 0)
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if !library.understood {
                        Note(text: "Still learning your saves: exact words only for now.")
                    } else if !library.close {
                        Note(text: "Nothing close. These are the nearest.")
                    }
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
                              spacing: 10) {
                        ForEach(library.results, id: \.key) { post in
                            Button {
                                focused = false
                                playing = PlayerStart(key: post.key)
                            } label: {
                                ResultTile(post: post, server: server)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.bottom, 20)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.immediately)
            .opacity(library.searching ? 0.6 : 1)
        }
    }
}

/// Which post the player opens on.
struct PlayerStart: Identifiable {
    let key: String
    var id: String { key }
}

/// The player over everything, with a way back.
struct PlayerScreen: View {
    let posts: [PhonePost]
    let server: URL
    let start: String
    @Environment(\.dismiss) private var dismiss
    @State private var clean = false
    @State private var scrubbing = false

    var body: some View {
        PlayerView(posts: posts, server: server, clean: $clean, scrubbing: $scrubbing, start: start)
            .overlay(alignment: .topLeading) {
                if !clean && !scrubbing {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(.black.opacity(0.5)))
                }
                .accessibilityLabel("Close")
                .padding(.leading, 16)
                .padding(.top, 8)
                }
            }
    }
}

private struct ResultTile: View {
    let post: PhonePost
    let server: URL

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.surface)
            if let poster = ADHXClient.resolve(post.posterUrl, against: server) {
                AsyncImage(url: poster) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else if phase.error != nil {
                        words
                    } else {
                        Theme.surface
                    }
                }
            } else {
                words
            }
            LinearGradient(colors: [.clear, .black.opacity(0.8)], startPoint: .center, endPoint: .bottom)
            HStack(spacing: 6) {
                NetworkMark(platform: post.platform, size: 12)
                if let strength = post.match?.strength {
                    Text(strength == "strong" ? "Strong match" : strength == "good" ? "Good match" : "Related")
                        .font(Theme.sans(11, .bold))
                        .foregroundStyle(strength == "related" ? Theme.muted : Theme.accent)
                }
                Spacer(minLength: 0)
                if post.plays {
                    Image(systemName: "play.fill").font(.system(size: 11)).foregroundStyle(.white)
                }
            }
            .padding(10)
        }
        .aspectRatio(3 / 4, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(Network.name(post.platform)), \(post.author.handle), \(post.text)")
        .accessibilityAddTraits(.isButton)
    }
}

extension ResultTile {
    /// A post with no picture (or one that won't load) shows its words.
    fileprivate var words: some View {
        Text(post.article?.title ?? post.text)
            .font(Theme.sans(13))
            .foregroundStyle(Theme.cream)
            .lineLimit(7)
            .padding(12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct Note: View {
    let text: String
    var body: some View {
        Text(text)
            .font(Theme.sans(14))
            .foregroundStyle(Theme.muted)
            .fixedSize(horizontal: false, vertical: true)
    }
}
