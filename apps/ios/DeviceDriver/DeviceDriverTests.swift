import XCTest

/// Drives ADHX Share on a real iPhone from the Mac, one command at a time.
///
/// `testDrive` polls the device hub (`e2e/devices/hub.mjs`) at
/// `ADHX_DRIVER_URL` for a command, runs it with XCUITest and posts the result
/// back, until the hub says `quit`. Commands are small JSON objects, for
/// example `{"op":"tap","label":"Home"}` or `{"op":"shot"}`; the list is in
/// `e2e/devices/README.md`. Without `ADHX_DRIVER_URL` the test skips, so it
/// never runs by accident.
///
/// Run it with `e2e/devices/ios.sh` (which passes the URL as
/// `TEST_RUNNER_ADHX_DRIVER_URL`), never in CI.
final class DeviceDriverTests: XCTestCase {
    private var base: URL!
    private lazy var adhx = XCUIApplication()
    private lazy var current: XCUIApplication = adhx

    func testDrive() throws {
        let env = ProcessInfo.processInfo.environment
        guard let raw = env["ADHX_DRIVER_URL"], let url = URL(string: raw) else {
            throw XCTSkip("Set TEST_RUNNER_ADHX_DRIVER_URL to drive the phone.")
        }
        base = url
        continueAfterFailure = true
        executionTimeAllowance = 6 * 60 * 60
        post("/hello", ["device": UIDevice.current.name, "system": UIDevice.current.systemVersion])
        while true {
            guard let command = next() else { continue }
            let op = command["op"] as? String ?? ""
            if op == "quit" {
                reply(command, ["ok": true])
                return
            }
            var result: [String: Any]
            do {
                result = try run(op, command)
                result["ok"] = true
            } catch {
                result = ["ok": false, "error": "\(error)"]
            }
            reply(command, result)
        }
    }

    // MARK: Commands

    struct Failure: Error, CustomStringConvertible {
        let description: String
    }

    private func run(_ op: String, _ c: [String: Any]) throws -> [String: Any] {
        switch op {
        case "launch":
            adhx.launchArguments = c["args"] as? [String] ?? []
            adhx.launchEnvironment = c["env"] as? [String: String] ?? [:]
            adhx.launch()
            current = adhx
            return [:]
        case "activate":
            current.activate()
            return [:]
        case "terminate":
            current.terminate()
            return [:]
        case "target":
            // Another app (Safari, Photos, Settings…), or back to ADHX with "adhx".
            let bundle = c["bundle"] as? String ?? "adhx"
            current = bundle == "adhx" ? adhx : XCUIApplication(bundleIdentifier: bundle)
            if c["activate"] as? Bool ?? true { current.activate() }
            return [:]
        case "state":
            return ["state": current.state.rawValue]
        case "tree":
            return ["tree": current.debugDescription]
        case "elements":
            return ["elements": elements(limit: c["limit"] as? Int ?? 300)]
        case "shot":
            let png = XCUIScreen.main.screenshot().pngRepresentation
            return ["png": png.base64EncodedString()]
        case "tap", "long", "double":
            let seconds = c["seconds"] as? Double ?? 1.0
            if let point = coordinate(c) {
                if op == "long" { point.press(forDuration: seconds) } else if op == "double" { point.doubleTap() } else { point.tap() }
                return [:]
            }
            let found = try find(c)
            // Tap where the element is, not the element itself: a failed
            // element tap ends the whole test, a coordinate tap never does.
            let point = center(of: found.frame)
            if op == "long" { point.press(forDuration: seconds) } else if op == "double" { point.doubleTap() } else { point.tap() }
            return ["label": found.label]
        case "type":
            let text = c["text"] as? String ?? ""
            if c["label"] != nil || c["id"] != nil || c["contains"] != nil {
                center(of: try find(c).frame).tap()
                Thread.sleep(forTimeInterval: 0.4)
            }
            current.typeText(text)
            return [:]
        case "clear":
            let field = try find(c)
            center(of: field.frame).tap()
            Thread.sleep(forTimeInterval: 0.4)
            let length = field.value?.count ?? 40
            current.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: max(length, 1)))
            return [:]
        case "swipe":
            // A drag across the middle of the element (or the screen), by coordinates.
            let frame = (c["label"] != nil || c["id"] != nil) ? try find(c).frame : current.frame
            let mid = CGPoint(x: frame.midX, y: frame.midY)
            let reach = CGVector(dx: frame.width * 0.35, dy: frame.height * 0.3)
            let (from, to): (CGPoint, CGPoint)
            switch c["dir"] as? String ?? "up" {
            case "down": (from, to) = (CGPoint(x: mid.x, y: mid.y - reach.dy), CGPoint(x: mid.x, y: mid.y + reach.dy))
            case "left": (from, to) = (CGPoint(x: mid.x + reach.dx, y: mid.y), CGPoint(x: mid.x - reach.dx, y: mid.y))
            case "right": (from, to) = (CGPoint(x: mid.x - reach.dx, y: mid.y), CGPoint(x: mid.x + reach.dx, y: mid.y))
            default: (from, to) = (CGPoint(x: mid.x, y: mid.y + reach.dy), CGPoint(x: mid.x, y: mid.y - reach.dy))
            }
            point(Double(from.x), Double(from.y)).press(forDuration: 0.05, thenDragTo: point(Double(to.x), Double(to.y)))
            return [:]
        case "drag":
            let from = point(c["x1"], c["y1"])
            let to = point(c["x2"], c["y2"])
            from.press(forDuration: c["hold"] as? Double ?? 0.05, thenDragTo: to)
            return [:]
        case "exists":
            let timeout = c["timeout"] as? Double ?? 5
            var copy = c
            copy["timeout"] = timeout
            return ["exists": (try? find(copy)) != nil]
        case "wait":
            Thread.sleep(forTimeInterval: c["seconds"] as? Double ?? 1)
            return [:]
        case "home":
            XCUIDevice.shared.press(.home)
            return [:]
        case "open":
            guard let raw = c["url"] as? String, let url = URL(string: raw) else {
                throw Failure(description: "open needs a url")
            }
            XCUIDevice.shared.system.open(url)
            return [:]
        case "alert":
            // System alerts (notifications, camera, local network) belong to SpringBoard.
            let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
            let button = springboard.alerts.buttons[c["button"] as? String ?? "Allow"]
            guard button.waitForExistence(timeout: c["timeout"] as? Double ?? 3) else {
                throw Failure(description: "no alert button \(c["button"] ?? "Allow")")
            }
            button.tap()
            return [:]
        case "orientation":
            switch c["to"] as? String ?? "portrait" {
            case "left": XCUIDevice.shared.orientation = .landscapeLeft
            case "right": XCUIDevice.shared.orientation = .landscapeRight
            default: XCUIDevice.shared.orientation = .portrait
            }
            return [:]
        default:
            throw Failure(description: "unknown op \(op)")
        }
    }

    struct Found {
        let label: String
        let value: String?
        let frame: CGRect
    }

    /// Finds `label` (or identifier), `id` or `contains`, optionally of a
    /// `type` (button, text, textField, …), the `index`-th match, in a snapshot
    /// of the screen. Snapshots hold up where element queries give up (a live
    /// camera view, a playing video), and nothing here can end the test.
    private func find(_ c: [String: Any]) throws -> Found {
        let label = c["label"] as? String
        let id = c["id"] as? String
        let part = (c["contains"] as? String)?.lowercased()
        guard label != nil || id != nil || part != nil else {
            throw Failure(description: "say which element: label, id or contains")
        }
        let wanted = c["type"] as? String
        let index = c["index"] as? Int ?? 0
        let until = Date().addingTimeInterval(c["timeout"] as? Double ?? 5)
        repeat {
            if let snapshot = try? current.snapshot() {
                var matches: [Found] = []
                func walk(_ node: XCUIElementSnapshot) {
                    let value = node.value as? String
                    let hit: Bool
                    if let label { hit = node.label == label || node.identifier == label }
                    else if let id { hit = node.identifier == id }
                    else {
                        hit = node.label.lowercased().contains(part!) || (value?.lowercased().contains(part!) ?? false)
                    }
                    if hit, wanted == nil || typeName(node.elementType) == wanted,
                       node.frame.width > 0, node.frame.height > 0 {
                        matches.append(Found(label: node.label, value: value, frame: node.frame))
                    }
                    for child in node.children { walk(child) }
                }
                walk(snapshot)
                if index < matches.count { return matches[index] }
            }
            Thread.sleep(forTimeInterval: 0.3)
        } while Date() < until
        throw Failure(description: "not found: \(c)")
    }

    private func center(of frame: CGRect) -> XCUICoordinate {
        point(Double(frame.midX), Double(frame.midY))
    }

    private func coordinate(_ c: [String: Any]) -> XCUICoordinate? {
        guard c["x"] != nil, c["y"] != nil else { return nil }
        return point(c["x"], c["y"])
    }

    /// Screen points from the top-left, the same frame `elements` reports.
    private func point(_ x: Any?, _ y: Any?) -> XCUICoordinate {
        let dx = (x as? Double) ?? Double(x as? Int ?? 0)
        let dy = (y as? Double) ?? Double(y as? Int ?? 0)
        return current.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: dx, dy: dy))
    }

    private func typeName(_ type: XCUIElement.ElementType) -> String {
        switch type {
        case .application: return "app"
        case .window: return "window"
        case .button: return "button"
        case .staticText: return "text"
        case .textField: return "textField"
        case .secureTextField: return "secureField"
        case .textView: return "textView"
        case .searchField: return "searchField"
        case .switch: return "switch"
        case .toggle: return "toggle"
        case .image: return "image"
        case .cell: return "cell"
        case .link: return "link"
        case .slider: return "slider"
        case .tab: return "tab"
        case .tabBar: return "tabBar"
        case .navigationBar: return "navBar"
        case .scrollView: return "scroll"
        case .collectionView: return "collection"
        case .table: return "table"
        case .sheet: return "sheet"
        case .alert: return "alert"
        case .keyboard: return "keyboard"
        case .key: return "key"
        case .segmentedControl: return "segmented"
        case .progressIndicator: return "progress"
        case .activityIndicator: return "activity"
        case .menu: return "menu"
        case .menuItem: return "menuItem"
        case .other: return "other"
        default: return "type\(type.rawValue)"
        }
    }

    /// Everything on screen with a label or an identifier: type, label, id,
    /// value and frame (points), the way a person would read the screen.
    private func elements(limit: Int) -> [[String: Any]] {
        let snapshot: XCUIElementSnapshot
        do { snapshot = try current.snapshot() } catch { return [] }
        var out: [[String: Any]] = []
        func walk(_ node: XCUIElementSnapshot) {
            if out.count >= limit { return }
            let field = [.textField, .secureTextField, .textView, .searchField].contains(node.elementType)
            // A field with no label still shows: by its placeholder, or as a bare field.
            let label = node.label.isEmpty && field ? (node.placeholderValue ?? "") : node.label
            let id = node.identifier
            let frame = node.frame
            if (!label.isEmpty || !id.isEmpty || field), frame.width > 0, frame.height > 0 {
                var item: [String: Any] = [
                    "type": typeName(node.elementType),
                    "frame": [Int(frame.minX), Int(frame.minY), Int(frame.width), Int(frame.height)],
                ]
                if !label.isEmpty { item["label"] = label }
                if !id.isEmpty { item["id"] = id }
                if let value = node.value as? String, !value.isEmpty { item["value"] = value }
                if !node.isEnabled { item["disabled"] = true }
                if node.isSelected { item["selected"] = true }
                out.append(item)
            }
            for child in node.children { walk(child) }
        }
        walk(snapshot)
        return out
    }

    // MARK: Hub

    private func next() -> [String: Any]? {
        var request = URLRequest(url: base.appendingPathComponent("next"))
        request.timeoutInterval = 40
        return send(request)
    }

    private func reply(_ command: [String: Any], _ result: [String: Any]) {
        var body = result
        body["cid"] = command["cid"]
        post("/result", body)
    }

    @discardableResult
    private func post(_ path: String, _ body: [String: Any]) -> [String: Any]? {
        var request = URLRequest(url: base.appendingPathComponent(String(path.dropFirst())))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        request.timeoutInterval = 30
        return send(request)
    }

    private func send(_ request: URLRequest) -> [String: Any]? {
        let done = DispatchSemaphore(value: 0)
        var json: [String: Any]?
        URLSession.shared.dataTask(with: request) { data, response, _ in
            if (response as? HTTPURLResponse)?.statusCode == 200, let data {
                json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            }
            done.signal()
        }.resume()
        if done.wait(timeout: .now() + request.timeoutInterval + 5) == .timedOut { return nil }
        if json == nil { Thread.sleep(forTimeInterval: 0.2) }
        return json
    }
}
