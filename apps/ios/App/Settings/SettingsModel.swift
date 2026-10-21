import Foundation

/// Settings: you, your people and (admins) who's waiting to be let in
/// (`/api/app/people`).
@MainActor
final class SettingsModel: ObservableObject {
    @Published private(set) var people: PeopleAnswer?
    @Published private(set) var loadError: String?
    /// This ADHX has no `/api/app/people` yet (404).
    @Published private(set) var unsupported = false
    /// The request an answer is on its way for.
    @Published private(set) var answering: String?
    @Published private(set) var answerError: String?

    var onBadKey: () -> Void = {}

    var me: Person? { people?.members.first(where: \.isYou) }
    /// Everyone let in and not banned, you first.
    var members: [Person] { people?.members.filter { !$0.banned } ?? [] }
    var requests: [JoinRequest] { people?.isAdmin == true ? people?.requests ?? [] : [] }
    /// The first admin: whose ADHX this is.
    var owner: Person? { people?.members.first { $0.role == "owner" } }

    func load() async {
        guard let client = Store.client() else { return }
        do {
            people = try await client.people()
            loadError = nil
            unsupported = false
            KnownPeople.replace(with: members.map(\.asSaver))
        } catch APIError.badKey {
            onBadKey()
        } catch let error as APIError where error.isMissing {
            unsupported = true
        } catch is CancellationError {
        } catch let error as APIError {
            loadError = error.message
        } catch {
            loadError = APIError.offline.message
        }
    }

    /// Let someone in, not now, or keep them out.
    func answer(_ request: JoinRequest, _ decision: JoinDecision) async {
        guard let client = Store.client(), answering == nil else { return }
        answering = request.id
        answerError = nil
        defer { answering = nil }
        do {
            try await client.answer(request: request.id, decision)
            await load()
        } catch APIError.badKey {
            onBadKey()
        } catch let error as APIError {
            answerError = error.message
            // Someone else may have answered already: show what's true now.
            if error.isMissing { await load() }
        } catch {
            answerError = "That didn’t go through. Try again."
        }
    }
}
