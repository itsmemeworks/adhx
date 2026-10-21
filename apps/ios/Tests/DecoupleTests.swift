import CoreGraphics
import Foundation

/// The phone without the web: your picture, invites, email sign-in and the
/// reactions feed (shapes from the decouple contract), plus the crop sums.
/// Run without a simulator, from the repository root:
///
/// swiftc apps/ios/Shared/API.swift apps/ios/Shared/FriendsAPI.swift apps/ios/Shared/AccountAPI.swift \
///   apps/ios/App/Settings/AvatarCrop.swift apps/ios/Tests/DecoupleTests.swift -o /tmp/adhx-decouple-tests
/// /tmp/adhx-decouple-tests
@main
struct DecoupleTests {
    static func main() throws {
        var checks = 0
        func check(_ condition: Bool, _ message: String) {
            precondition(condition, message)
            checks += 1
        }
        func near(_ a: CGFloat, _ b: CGFloat, _ tolerance: CGFloat = 0.001) -> Bool { abs(a - b) <= tolerance }
        let decoder = JSONDecoder()

        // MARK: Your picture

        let me = try decoder.decode(MeResult.self, from: Data("""
        {"username":"pete","name":"iPhone","avatarUrl":"/api/files/avatar/abc","avatarSource":"upload"}
        """.utf8))
        check(me.avatarSource == "upload", "where your picture came from")
        let oldMe = try decoder.decode(MeResult.self, from: Data(#"{"username":"pete"}"#.utf8))
        check(oldMe.avatarSource == nil && oldMe.avatarUrl == nil, "older servers say neither")

        let changed = try decoder.decode(AvatarAnswer.self, from: Data(#"{"avatarUrl":"/api/files/avatar/def","source":"gob"}"#.utf8))
        check(changed.avatarUrl == "/api/files/avatar/def" && changed.source == "gob", "a Gob face")
        let removed = try decoder.decode(AvatarAnswer.self, from: Data(#"{"avatarUrl":null,"source":"generated"}"#.utf8))
        check(removed.avatarUrl == nil && removed.source == "generated", "back to your initial")
        let bare = try decoder.decode(AvatarAnswer.self, from: Data(#"{"avatarUrl":""}"#.utf8))
        check(bare.avatarUrl == nil && bare.source == "generated", "an empty address is no picture")

        check(GobColour.allCases.map(\.rawValue) == ["blue", "teal", "coral", "lime"], "the web's four Gobs, in order")
        check(GobColour.coral.hex == 0xFF7A59 && GobColour.coral.label == "Coral", "a Gob's colour and name")

        // Your face: what this phone stored wins; after Remove it's your letter.
        check(YourPicture.choose(stored: "/new", source: "upload", sent: "/old") == "/new", "your newest picture wins")
        check(YourPicture.choose(stored: nil, source: "generated", sent: "/old") == nil, "removed: a letter, not the cached one")
        check(YourPicture.choose(stored: nil, source: nil, sent: "/sent") == "/sent", "an older server: what the post says")
        check(YourPicture.choose(stored: nil, source: nil, sent: nil) == nil, "no picture anywhere: a letter")
        check(YourPicture.choose(stored: "", source: nil, sent: "/sent") == "/sent", "an empty stored address is none")
        check(YourPicture.sameName("@Pete", "pete") && !YourPicture.sameName("pete", "peter"), "you, by username")

        // The upload's form.
        var form = MultipartForm(boundary: "b")
        form.file("file", filename: "picture.jpg", type: "image/jpeg", bytes: Data([0xFF, 0xD8]))
        form.field("x", "0.5000")
        let body = String(decoding: form.finished(), as: UTF8.self)
        check(form.contentType == "multipart/form-data; boundary=b", "the form's type")
        check(body.hasPrefix("--b\r\nContent-Disposition: form-data; name=\"file\"; filename=\"picture.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n"),
              "the photo part")
        check(body.contains("--b\r\nContent-Disposition: form-data; name=\"x\"\r\n\r\n0.5000\r\n"), "a crop field")
        check(body.hasSuffix("--b--\r\n"), "closed")

        // MARK: Crop sums

        let wide = CGSize(width: 4000, height: 3000)
        let side: CGFloat = 300
        // Zoom 1, centred: the short side fills the square, the middle of the photo.
        var rect = AvatarCrop.sourceRect(imageSize: wide, side: side, zoom: 1, offset: .zero)
        check(near(rect.width, 3000) && near(rect.minX, 500) && near(rect.minY, 0), "centred, the whole height")
        var server = AvatarCrop.serverCrop(imageSize: wide, side: side, zoom: 1, offset: .zero)
        check(abs(server.x - 0.5) < 0.0001 && abs(server.y - 0.5) < 0.0001 && server.zoom == 1, "the server's centre")
        // Dragged all the way right: the photo's left edge in the circle.
        let farRight = AvatarCrop.clampOffset(CGSize(width: 9999, height: 50), imageSize: wide, side: side, zoom: 1)
        check(near(farRight.width, 50) && near(farRight.height, 0), "it can't leave the square uncovered")
        rect = AvatarCrop.sourceRect(imageSize: wide, side: side, zoom: 1, offset: farRight)
        check(near(rect.minX, 0), "dragged right shows the left edge")
        // Zoomed 2× and moved up-left by 30 points: a 1500 square, down-right of centre.
        rect = AvatarCrop.sourceRect(imageSize: wide, side: side, zoom: 2, offset: CGSize(width: -30, height: -30))
        // scale = 300/3000*2 = 0.2 points per pixel; 30 points = 150 pixels.
        check(near(rect.width, 1500) && near(rect.minX, 1250 + 150) && near(rect.minY, 750 + 150), "zoomed and moved")
        server = AvatarCrop.serverCrop(imageSize: wide, side: side, zoom: 2, offset: CGSize(width: -30, height: -30))
        check(abs(server.x - (2150.0 / 4000)) < 0.0001 && abs(server.y - (1650.0 / 3000)) < 0.0001 && server.zoom == 2,
              "the same crop as the server reads it")
        check(AvatarCrop.clampZoom(9) == 4 && AvatarCrop.clampZoom(0.2) == 1 && AvatarCrop.clampZoom(.nan) == 1,
              "zoom stays 1–4")
        // Tall photos: the width fills.
        let tall = CGSize(width: 1080, height: 1920)
        rect = AvatarCrop.sourceRect(imageSize: tall, side: 200, zoom: 1, offset: CGSize(width: 0, height: 9999))
        check(near(rect.width, 1080) && near(rect.minY, 0) && near(rect.minX, 0), "a tall photo, its top")
        check(AvatarCrop.outputSide(cropPoints: 3000, imageScale: 1) == 1024, "at most 1024 pixels")
        check(AvatarCrop.outputSide(cropPoints: 100, imageScale: 1) == 256, "at least 256")
        check(AvatarCrop.outputSide(cropPoints: 300, imageScale: 2) == 600, "the crop's own pixels")

        // MARK: Invites

        let invites = try decoder.decode(InvitesAnswer.self, from: Data("""
        {"invites":[
          {"id":"inv_1","url":"https://adhx.example/invite/tok","createdAt":"2026-10-21T05:24:06.105Z",
           "expiresAt":"2026-10-28T05:24:06.105Z","uses":0},
          {"id":"inv_2","url":null,"createdAt":1792999446105,"expiresAt":1793604246105,"uses":2},
          {"url":"https://nope"}
        ]}
        """.utf8))
        check(invites.invites.count == 2, "an invite without an id is skipped")
        check(invites.invites[0].url == "https://adhx.example/invite/tok", "the link to send")
        check(invites.invites[0].expiresAt == AccountDates.parse("2026-10-28T05:24:06.105Z"), "an ISO date")
        check(invites.invites[1].url == nil && invites.invites[1].uses == 2, "a link shown once, used twice")
        check(invites.invites[1].createdAt.map { abs($0.timeIntervalSince1970 - 1_792_999_446.105) < 0.01 } == true,
              "milliseconds read as a date")
        let made = try decoder.decode(Invite.self, from: Data(#"{"id":"inv_3","url":"https://adhx.example/invite/x","expiresAt":"2026-10-28T05:24:06Z"}"#.utf8))
        check(made.id == "inv_3" && made.uses == 0 && made.expiresAt != nil, "a new link (POST)")
        let now = AccountDates.parse("2026-10-21T05:24:06Z")!
        check(made.lifeLine(now: now) == "Works for 7 more days", "a week left")
        check(Invite(id: "a", url: nil, expiresAt: now.addingTimeInterval(5 * 3600)).lifeLine(now: now) == "Works for 5 more hours",
              "hours left")
        check(Invite(id: "a", url: nil, expiresAt: now.addingTimeInterval(-1)).lifeLine(now: now) == "Stopped working", "run out")
        let empty = try decoder.decode(InvitesAnswer.self, from: Data("{}".utf8))
        check(empty.invites.isEmpty, "none yet")

        // MARK: Email sign-in

        check(SignInWords.code("123 456") == "123456" && SignInWords.code("12-34-567") == "123456", "six digits")
        check(SignInWords.code("abc") == "", "letters aren't a code")
        check(SignInWords.looksLikeEmail("pete@example.com") && !SignInWords.looksLikeEmail("pete@example")
              && !SignInWords.looksLikeEmail("@example.com") && !SignInWords.looksLikeEmail("pe te@example.com"),
              "looks like an email")
        check(SignInWords.message(for: .server(status: 400, code: "bad_code", message: "x")).hasPrefix("That code didn’t work"),
              "a wrong code")
        check(SignInWords.message(for: .server(status: 410, code: "expired", message: "x")).contains("run out"), "a spent code")
        check(SignInWords.message(for: .server(status: 429, code: "busy", message: "x")).contains("Wait a minute"), "too many tries")
        let signedIn = try decoder.decode(PairResult.self, from: Data(#"{"key":"k_1","username":"pete","name":"iPhone"}"#.utf8))
        check(signedIn.key == "k_1" && signedIn.username == "pete", "the same answer as pairing")

        // MARK: The reactions feed

        let page = try decoder.decode(ReactedPage.self, from: Data("""
        {"items":[
          {"platform":"tiktok","id":"7","kind":"video","author":{"handle":"cook"},"text":"pasta",
           "media":[{"kind":"video","url":"/api/files/tiktok/7/0","posterUrl":"/api/files/tiktok/7/poster"}],
           "reactions":{"count":4,"last":{"emoji":"😂","text":null,"at":"2026-10-21T05:24:06.105Z",
             "saver":{"username":"ana","name":"Ana","avatarUrl":"/api/files/avatar/ana","isYou":false}}}},
          {"platform":"twitter","id":"9","kind":"text","author":{"handle":"jo"},"text":"words",
           "reactions":{"count":1,"last":{"emoji":null,"text":"this is the one","at":"2026-10-21T05:20:00Z",
             "saver":{"username":"pete","name":"Pete","avatarUrl":null,"isYou":true}}}},
          {"platform":"twitter","id":"10","kind":"text","author":{"handle":"jo"},"text":"no summary"},
          {"broken":true}
        ],"nextOffset":30}
        """.utf8))
        check(page.items.count == 3, "a post that won't read is skipped")
        check(page.nextOffset == 30, "there's more")
        check(page.items[0].post.key == "tiktok:7" && page.items[0].post.posterUrl == "/api/files/tiktok/7/poster",
              "the post plays like any other")
        check(page.items[0].reactions.count == 4, "how many reactions")
        check(page.items[0].reactions.last?.emoji == "😂" && page.items[0].reactions.last?.saver.username == "ana",
              "the last reaction and who")
        check(page.items[0].reactions.last?.saver.avatarUrl == "/api/files/avatar/ana", "their face")
        check(page.items[1].reactions.last?.text == "this is the one" && page.items[1].reactions.last?.saver.isYou == true,
              "a few words of yours")
        check(page.items[2].reactions.count == 0 && page.items[2].reactions.last == nil, "a post without its summary still plays")
        let end = try decoder.decode(ReactedPage.self, from: Data(#"{"items":[],"nextOffset":null}"#.utf8))
        check(end.items.isEmpty && end.nextOffset == nil, "the end")
        check(ReactedPage.countLine(12, more: false) == "12 posts with reactions", "the count")
        check(ReactedPage.countLine(1, more: false) == "1 post with reactions", "one")
        check(ReactedPage.countLine(30, more: true) == "30+ posts with reactions", "more to come")

        // Opening the app from the share sheet never goes to the website.
        check(Links.app.absoluteString == "adhx://open", "the app")
        check(Links.postRef(from: Links.post(platform: "tiktok", id: "7")!) == PostRef(platform: "tiktok", id: "7"),
              "the app, on the post")
        check(Links.postRef(from: Links.app) == nil && Links.pairing(from: Links.app) == nil, "the app's root opens Home")

        print("DecoupleTests: \(checks) checks passed")
    }
}
