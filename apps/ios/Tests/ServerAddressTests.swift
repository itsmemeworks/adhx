import Foundation

// Compile the address helpers alone:
// swiftc apps/ios/Shared/API.swift apps/ios/Shared/FriendsAPI.swift apps/ios/Tests/ServerAddressTests.swift -o /tmp/adhx-server-address && /tmp/adhx-server-address

@main struct ServerAddressTests {
  static func main() {
    // What people type becomes an origin: https unless it's a local address.
    precondition(Links.serverURL(from: "adhx.example.com")?.absoluteString == "https://adhx.example.com")
    precondition(Links.serverURL(from: "192.168.1.4:3000/")?.absoluteString == "http://192.168.1.4:3000")
    precondition(Links.serverURL(from: "nas.local:3000")?.absoluteString == "http://nas.local:3000")

    // An IPv6 address (a phone wired to a Mac, a home network) is local too,
    // and is shown in brackets, so the port isn't read as part of it.
    let v6 = Links.serverURL(from: "[fd87:3e5:9915::2]:3600")
    precondition(v6?.absoluteString == "http://[fd87:3e5:9915::2]:3600")
    precondition(Links.displayHost(v6) == "[fd87:3e5:9915::2]:3600")

    // Connect fills in the address it shows; that has to connect again.
    for typed in ["adhx.example.com", "192.168.1.4:3000", "http://[fd87:3e5:9915::2]:3600"] {
      let url = Links.serverURL(from: typed)
      precondition(Links.serverURL(from: Links.displayHost(url))?.host == url?.host, "round trip: \(typed)")
    }
    print("ServerAddressTests passed")
  }
}
