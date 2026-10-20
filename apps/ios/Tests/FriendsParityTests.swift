import Foundation

/// Run without a simulator: swiftc Shared/API.swift Shared/FriendsAPI.swift Tests/FriendsParityTests.swift -o /tmp/adhx-friends-parity-tests && /tmp/adhx-friends-parity-tests
@main
struct FriendsParityTests {
    static func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    static func main() throws {
        var checks = 0
        func check(_ condition: Bool, _ message: String) {
            precondition(condition, message)
            checks += 1
        }

        // Show less / more: only -1 and 1 kept, read loosely.
        let weights = try decode(FeedWeights.self, #"{"weights":{"ana":1,"ben":-1,"mum":0,"jo":2}}"#)
        check(weights.weights == ["ana": 1, "ben": -1, "jo": 1], "weights decode to -1 / 1, zero dropped")
        check(try decode(FeedWeights.self, #"{}"#).weights.isEmpty, "no weights is none")

        // A friend's channel: new marks and their note.
        let queue = try decode(ChannelQueue.self, """
        {"items":[
          {"platform":"youtube","id":"a","kind":"video","author":{"handle":"x"},"isNew":true},
          {"platform":"youtube","id":"b","kind":"video","author":{"handle":"x"},"isNew":false},
          {"platform":"x","id":"c","kind":"photo","author":{"handle":"y"}},
          {"broken":true}
        ],
        "note":{"text":"  the original and still the best ","platform":"youtube","id":"b","savedAt":"2026-10-17T02:09:01.940Z"}}
        """)
        check(queue.items.map(\.key) == ["youtube:a", "youtube:b", "x:c"], "a bad item is skipped")
        check(queue.fresh.map(\.key) == ["youtube:a"], "only isNew posts play as new")
        check(queue.items[2].isNew == nil, "mine items carry no mark")
        check(queue.note?.text == "the original and still the best" && queue.note?.key == "youtube:b", "note trimmed and keyed")
        check(try decode(ChannelQueue.self, #"{"items":[],"note":null}"#).note == nil, "null note is none")
        check(try decode(ChannelQueue.self, #"{"items":[],"note":{"text":"","platform":"x","id":"1"}}"#).note == nil, "empty note is none")

        // Live: how busy, and what's forming.
        let live = try decode(LiveSnapshot.self, """
        {"label":"Right now","moments":[
          {"slug":"babies","title":"Babies vs objects","recentSaves":3,"windowMinutes":10},
          {"slug":"quiet","title":"Quiet","recentSaves":0,"windowMinutes":60},
          {"slug":"old","title":"Old"}
        ],
        "forming":[{"id":"f1","title":"Kitchen synths","hue":"#7fd1ae","have":2,"need":3,"unit":"saves","covers":["/a.jpg"]},
                   {"id":"f2","title":"People","have":1,"need":3,"unit":"people","covers":[]}]}
        """)
        check(live.label == "Right now", "window label")
        check(live.moments.map(\.busyLine) == ["3 saves in 10 min", nil, nil], "busy line falls back at 0 or missing")
        check(live.forming.map(\.toGoLine) == ["1 more save to go live", "2 more people to go live"], "forming lines")
        check(live.forming[0].covers == ["/a.jpg"], "forming covers")
        let legacy = try decode(LiveSnapshot.self, #"{"moments":[{"slug":"x"}]}"#)
        check(legacy.forming.isEmpty && legacy.label == nil, "older server: no forming")
        let one = try decode(LiveMoment.self, #"{"slug":"m","recentSaves":1,"windowMinutes":5}"#)
        check(one.busyLine == "1 save in 5 min", "singular save")

        print("iOS friends parity: \(checks) assertions passed")
    }
}
