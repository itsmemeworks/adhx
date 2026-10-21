import Foundation

/// Run without a simulator:
/// swiftc Shared/API.swift Shared/FriendsAPI.swift Tests/BoardFeaturesTests.swift -o /tmp/adhx-board-features-tests && /tmp/adhx-board-features-tests
///
/// Fixtures follow the board-features contract: send straight to your people
/// (j4-4), forming faces and alerts (j7-3), the like reason's thumbnail (j2-2)
/// and keeping a group channel (j6-2).
@main
struct BoardFeaturesTests {
    static func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    static func main() throws {
        var checks = 0
        func check(_ condition: Bool, _ message: String) {
            precondition(condition, message)
            checks += 1
        }

        // 1. Send straight to your people.
        let targets = try decode(SendTargets.self, """
        {"sendable":true,"people":[
          {"username":"ana","name":"Ana","avatarUrl":null,"has":false,"sent":false},
          {"username":"ben","name":"Ben","has":false,"sent":true},
          {"username":"jo","name":"Jo","avatarUrl":"/api/people/jo/avatar","has":true,"sent":false},
          {"name":"no username"}
        ]}
        """)
        check(targets.sendable, "sendable")
        check(targets.people.map(\.username) == ["ana", "ben", "jo"], "a person without a username is skipped")
        check(targets.people[1].sent && !targets.people[1].has, "sent read")
        check(targets.people[2].has && targets.people[2].avatarUrl == "/api/people/jo/avatar", "has and face read")
        check(targets.alreadyLine == "Jo already has it.", "one already has it")
        let two = SendTargets(sendable: true, people: [SendPerson(username: "jo", name: "Jo", has: true),
                                                       SendPerson(username: "ben", name: "Ben", has: true)])
        check(two.alreadyLine == "Jo and Ben already have it.", "two already have it")
        check(SendTargets(sendable: true, people: [SendPerson(username: "a")]).alreadyLine == nil, "nobody has it")
        let justYou = try decode(SendTargets.self, #"{"sendable":false,"people":[]}"#)
        check(!justYou.sendable && justYou.people.isEmpty, "a private save isn't sendable")
        check(try decode(SendTargets.self, #"{"people":[]}"#).sendable, "sendable defaults on")

        // A post sent to you passes New's kind filter (sentToYou), others don't.
        let sentText = try decode(PhonePost.self, #"{"platform":"x","id":"1","kind":"text","author":{"handle":"ana"},"whyReasons":[{"kind":"sent","text":"Ana sent you this","username":"ana"}]}"#)
        let plainText = try decode(PhonePost.self, #"{"platform":"x","id":"2","kind":"text","author":{"handle":"ben"},"whyReasons":[{"kind":"together","text":"Ana and Ben saved this"}]}"#)
        check(sentText.sentToYou && !plainText.sentToYou, "a send is told apart")

        let result = try decode(SendResult.self, """
        {"sent":["ana"],"skipped":[{"username":"ben","reason":"has"},{"username":"zed","reason":"unknown"},{"x":1}]}
        """)
        check(result.sent == ["ana"], "sent list")
        check(result.skipped.map(\.reason) == ["has", "unknown"], "skipped reasons, a bad one dropped")

        // In New: the sent reason, and a kind this app has never heard of.
        let sentPost = try decode(PhonePost.self, """
        {"platform":"youtube","id":"v1","kind":"video","author":{"handle":"x"},
         "savers":[{"username":"pete","name":"Pete","note":"watch till the end"}],
         "whyReasons":[{"kind":"sent","text":"Pete sent you this","username":"pete"},
                       {"kind":"brand-new-kind","text":"Something new","extra":{"a":1}}]}
        """)
        check(sentPost.why == "Pete sent you this", "sent is the headline")
        check(sentPost.whyReasons.first?.kind == "sent" && sentPost.whyReasons.first?.username == "pete",
              "sent reason names the sender")
        check(sentPost.whyReasons.count == 2 && sentPost.whyReasons[1].text == "Something new",
              "an unknown kind is kept as its words")
        check(sentPost.savers.first?.note == "watch till the end", "the note rides on the sender's saver")

        // 2. Forming moments: faces and the bell.
        let live = try decode(LiveSnapshot.self, """
        {"moments":[],"forming":[
          {"id":"f1","title":"Kitchen synths","have":2,"need":3,"unit":"saves",
           "people":[{"username":"jo","name":"Jo","avatarUrl":null},{"username":"ben","name":"Ben"}],"alert":true},
          {"id":"f2","title":"Old server","have":1,"need":3,"savers":[{"username":"mum"}]},
          {"id":"f3","title":"Signed out","have":1,"need":3,"alert":"yes"}
        ]}
        """)
        check(live.forming.map(\.alert) == [true, false, false], "alert read, loose")
        check(live.forming[0].savers.map(\.username) == ["jo", "ben"], "people are the faces")
        check(live.forming[1].savers.map(\.username) == ["mum"], "older servers' savers still work")
        check(live.forming[2].savers.isEmpty, "no people, no faces")

        let alerts = try decode(LiveAlerts.self, """
        {"alerts":[{"id":"a1","slug":"kitchen-synths-x1y2","title":"Kitchen synths","at":"2026-10-20T10:00:00.000Z"},
                   {"id":7,"slug":"numbered","title":"Numbered id"},
                   {"id":"a3","title":"No slug"}]}
        """)
        check(alerts.alerts.map(\.id) == ["a1", "7"], "alerts without a slug are dropped, numeric ids read")
        check(alerts.alerts[0].headline == "Kitchen synths is live", "notification words")
        check(try decode(LiveAlerts.self, #"{}"#).alerts.isEmpty, "no alerts")

        var ledger = AlertLedger(told: ["a1"])
        let fresh = ledger.untold(alerts.alerts)
        check(fresh.map(\.id) == ["7"], "an alert already shown isn't shown twice")
        ledger.remember(fresh)
        check(ledger.untold(alerts.alerts).isEmpty, "remembered")
        var full = AlertLedger(told: (0..<300).map { "x\($0)" })
        full.remember([LiveAlert(id: "new", slug: "s", title: "T")])
        check(full.told.count == AlertLedger.limit && full.told.last == "new", "the ledger stays bounded")

        // 3. The like reason's thumbnail.
        let liked = try decode(PhonePost.self, """
        {"platform":"reddit","id":"r1","kind":"video","author":{"handle":"x"},
         "whyReasons":[{"kind":"together","text":"Ana and Ben both saved it"},
                       {"kind":"like","text":"Like the baby videos you kept",
                        "post":{"platform":"instagram","id":"C1","posterUrl":"/api/files/instagram/C1/poster"}},
                       {"kind":"like","text":"No picture","post":{"platform":"x","id":"9","posterUrl":""}},
                       {"kind":"like","text":"Broken post","post":{"id":"9"}}]}
        """)
        let like = liked.whyReasons[1]
        check(like.post?.posterUrl == "/api/files/instagram/C1/poster" && like.post?.ref.key == "instagram:C1",
              "like reason carries its post")
        check(liked.whyReasons[2].post?.posterUrl == nil, "an empty poster is none")
        check(liked.whyReasons.count == 4 && liked.whyReasons[3].post == nil, "a broken post keeps the reason")

        // 4. Keep this channel.
        let queue = try decode(ChannelQueue.self, """
        {"items":[{"platform":"x","id":"1","kind":"photo","author":{"handle":"a"},"isNew":true}],
         "kept":{"tag":"food-youll-cook","url":"/t/pete/food-youll-cook"}}
        """)
        check(queue.kept == KeptChannel(tag: "food-youll-cook", url: "/t/pete/food-youll-cook"), "kept read")
        check(try decode(ChannelQueue.self, #"{"items":[],"kept":null}"#).kept == nil, "not kept")
        check(try decode(ChannelQueue.self, #"{"items":[]}"#).kept == nil, "older server: not kept")
        let keep = try decode(KeepAnswer.self, #"{"tag":"food-youll-cook","url":"/t/pete/food-youll-cook","added":37}"#)
        check(keep.kept.tag == "food-youll-cook" && keep.added == 37, "keep answer")

        print("iOS board features: \(checks) assertions passed")
    }
}
