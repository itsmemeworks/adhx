import Foundation

#if ADHX_HISTORY_TEST
enum KnownPeople { static func clear() {} }
#endif

/// Run without a device: swiftc -D ADHX_HISTORY_TEST Shared/API.swift Shared/FriendsAPI.swift Shared/Network.swift Shared/NetworkPaths.swift Shared/SVGPath.swift Shared/ResumeStore.swift Shared/Storage.swift Tests/SideloadGroupTests.swift -o /tmp/adhx-sideload-tests && /tmp/adhx-sideload-tests
@main
struct SideloadGroupTests {
    static func main() {
        let declared = "group.com.you.adhxshare"
        let renamed = "group.com.you.adhxshare.AB12CD34EF"

        // A normal build (Xcode, TestFlight, AltStore PAL) keeps its group.
        precondition(AppGroup.resolve(declared: declared, signed: [declared]) { $0 == declared } == declared)
        // A SideStore or AltStore build only has the renamed group.
        precondition(AppGroup.resolve(declared: declared, signed: [renamed]) { $0 == renamed } == renamed)
        // Unrelated groups, and a lookalike that only shares the start, are never taken.
        let lookalike = "group.com.you.adhxsharex.AB12CD34EF"
        precondition(AppGroup.resolve(declared: declared, signed: ["group.other", lookalike]) { _ in true } == declared)
        // Nothing usable (an unsigned simulator build): unchanged, the declared id.
        precondition(AppGroup.resolve(declared: declared, signed: [renamed]) { _ in false } == declared)

        // Reading the groups out of a provisioning profile's signed wrapper.
        let plist = """
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
            <plist version="1.0"><dict><key>Entitlements</key><dict>
            <key>com.apple.security.application-groups</key><array><string>\(renamed)</string></array>
            </dict></dict></plist>
            """
        var profile = Data([0x30, 0x82, 0x01, 0x00, 0xA0, 0x80])
        profile.append(Data(plist.utf8))
        profile.append(Data([0x00, 0x00, 0xA0, 0x82]))
        precondition(AppGroup.profileGroups(profile) == [renamed])
        precondition(AppGroup.profileGroups(Data("not a profile".utf8)).isEmpty)

        print("iOS sideload app group: 6 assertions passed")
    }
}
