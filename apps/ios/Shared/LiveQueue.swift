import Foundation

/// A bounded live queue: refresh names in place, remove only authoritative
/// removals, and insert arrivals after the playing identity rather than its index.
func mergeLiveQueue(current: [PhonePost], fresh: [PhonePost], removed: Set<String>, playing: String?, saverUpdates: [String: LiveSaverUpdate] = [:]) -> [PhonePost] {
    let updated = Dictionary(fresh.map { ($0.key, $0) }, uniquingKeysWith: { _, latest in latest })
    var items = current.filter { !removed.contains($0.key) }.map { cached in
        if let fresh = updated[cached.key] { return fresh }
        var post = cached
        if let update = saverUpdates[cached.key] { post.savers = update.savers; post.isPrivate = update.isPrivate }
        return post
    }
    let have = Set(current.map(\.key))
    let arrivals = fresh.filter { !have.contains($0.key) && !removed.contains($0.key) }
    let index = playing.flatMap { key in items.firstIndex(where: { $0.key == key }) } ?? 0
    items.insert(contentsOf: arrivals, at: min(index + 1, items.count))
    if items.count > 200 {
        let playingIndex = playing.flatMap { key in items.firstIndex(where: { $0.key == key }) } ?? 0
        let start = min(max(0, playingIndex - 60), items.count - 200)
        items = Array(items[start..<(start + 200)])
    }
    return items
}
