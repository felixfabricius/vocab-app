import Foundation
import Capacitor
import UIKit

/// Text files in the app's iCloud Drive container (`Documents/`, visible in the Files
/// app under the app's name). Used by the snapshot + change-log sync (PLAN-NATIVE M5).
/// Paths are relative to `Documents/`.
@objc(CloudFilesPlugin)
public class CloudFilesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CloudFilesPlugin"
    public let jsName = "CloudFiles"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "delete", returnType: CAPPluginReturnPromise),
    ]

    private let queue = DispatchQueue(label: "in.fabricius.vocab.cloudfiles", qos: .utility)
    private var documentsURL: URL?

    /// The container's Documents folder; resolved off the main thread and cached once found.
    private func documents(_ done: @escaping (URL?) -> Void) {
        queue.async {
            if self.documentsURL == nil,
               let container = FileManager.default.url(forUbiquityContainerIdentifier: nil) {
                let docs = container.appendingPathComponent("Documents", isDirectory: true)
                try? FileManager.default.createDirectory(at: docs, withIntermediateDirectories: true)
                self.documentsURL = docs
            }
            done(self.documentsURL)
        }
    }

    private func url(_ docs: URL, _ path: String) -> URL? {
        let clean = path.split(separator: "/").filter { $0 != "." && $0 != ".." && !$0.isEmpty }.joined(separator: "/")
        if clean.isEmpty { return nil }
        return docs.appendingPathComponent(clean)
    }

    @objc func available(_ call: CAPPluginCall) {
        documents { docs in
            call.resolve(["available": docs != nil, "path": docs?.path ?? ""])
        }
    }

    @objc func read(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { return call.reject("path missing", "failed") }
        let waitSeconds = call.getDouble("waitSeconds") ?? 10
        documents { docs in
            guard let docs = docs, let file = self.url(docs, path) else { return call.reject("iCloud Drive is not available", "unavailable") }
            let fm = FileManager.default
            if !fm.fileExists(atPath: file.path) {
                // A placeholder that has not been downloaded yet: ask for it and wait a little.
                try? fm.startDownloadingUbiquitousItem(at: file)
                let deadline = Date().addingTimeInterval(waitSeconds)
                while !fm.fileExists(atPath: file.path) && Date() < deadline {
                    Thread.sleep(forTimeInterval: 0.25)
                }
            }
            guard fm.fileExists(atPath: file.path) else { return call.reject("Not found: \(path)", "notFound") }
            do {
                let text = try String(contentsOf: file, encoding: .utf8)
                call.resolve(["text": text])
            } catch {
                call.reject("Read failed: \(error.localizedDescription)", "failed")
            }
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), let text = call.getString("text") else { return call.reject("path or text missing", "failed") }
        // The app may be going to the background; keep the process alive until the write is done.
        var bg = UIBackgroundTaskIdentifier.invalid
        bg = UIApplication.shared.beginBackgroundTask(withName: "cloudfiles.write") {
            UIApplication.shared.endBackgroundTask(bg)
            bg = .invalid
        }
        let finish = {
            if bg != .invalid {
                UIApplication.shared.endBackgroundTask(bg)
                bg = .invalid
            }
        }
        documents { docs in
            defer { finish() }
            guard let docs = docs, let file = self.url(docs, path) else { return call.reject("iCloud Drive is not available", "unavailable") }
            do {
                try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
                try text.data(using: .utf8)?.write(to: file, options: .atomic)
                call.resolve(["bytes": text.utf8.count])
            } catch {
                call.reject("Write failed: \(error.localizedDescription)", "failed")
            }
        }
    }

    @objc func list(_ call: CAPPluginCall) {
        let dir = call.getString("dir") ?? ""
        documents { docs in
            guard let docs = docs else { return call.reject("iCloud Drive is not available", "unavailable") }
            let folder = dir.isEmpty ? docs : (self.url(docs, dir) ?? docs)
            var entries: [[String: Any]] = []
            let fm = FileManager.default
            if let names = try? fm.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey], options: []) {
                for item in names {
                    var name = item.lastPathComponent
                    // Not-yet-downloaded items appear as ".name.icloud" placeholders.
                    var downloaded = true
                    if name.hasPrefix(".") && name.hasSuffix(".icloud") {
                        name = String(name.dropFirst().dropLast(".icloud".count))
                        downloaded = false
                    }
                    let values = try? item.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
                    entries.append([
                        "name": name,
                        "modifiedAt": values?.contentModificationDate.map { ISO8601DateFormatter().string(from: $0) } ?? "",
                        "size": values?.fileSize ?? 0,
                        "downloaded": downloaded,
                    ])
                }
            }
            call.resolve(["entries": entries])
        }
    }

    @objc func delete(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { return call.reject("path missing", "failed") }
        documents { docs in
            guard let docs = docs, let file = self.url(docs, path) else { return call.reject("iCloud Drive is not available", "unavailable") }
            try? FileManager.default.removeItem(at: file)
            call.resolve()
        }
    }
}
