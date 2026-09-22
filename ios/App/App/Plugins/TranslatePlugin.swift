import Foundation
import Capacitor
import SwiftUI
import Translation

/// Offline translation through Apple's Translation framework. The framework only
/// hands out a session through the SwiftUI `translationTask` modifier, so the
/// plugin hosts an invisible SwiftUI view and pumps requests through it.
@objc(TranslatePlugin)
public class TranslatePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TranslatePlugin"
    public let jsName = "Translate"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "translate", returnType: CAPPluginReturnPromise),
    ]

    private let coordinator = TranslatorCoordinator()
    private var host: UIHostingController<TranslatorHost>?

    public override func load() {
        DispatchQueue.main.async {
            let hc = UIHostingController(rootView: TranslatorHost(coordinator: self.coordinator))
            hc.view.backgroundColor = .clear
            hc.view.alpha = 0.01
            hc.view.isUserInteractionEnabled = false
            hc.view.frame = CGRect(x: 0, y: 0, width: 1, height: 1)
            if let parent = self.bridge?.viewController {
                parent.addChild(hc)
                parent.view.addSubview(hc.view)
                hc.didMove(toParent: parent)
            }
            self.host = hc
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        let from = call.getString("from") ?? "es"
        let to = call.getString("to") ?? "en"
        Task {
            let availability = LanguageAvailability()
            let status = await availability.status(from: Locale.Language(identifier: from), to: Locale.Language(identifier: to))
            let text: String
            switch status {
            case .installed: text = "installed"
            case .supported: text = "supported"
            case .unsupported: text = "unsupported"
            @unknown default: text = "unsupported"
            }
            call.resolve(["status": text])
        }
    }

    /// Shows Apple's download sheet for the language pair when it is not installed yet.
    @objc func prepare(_ call: CAPPluginCall) {
        let from = call.getString("from") ?? "es"
        let to = call.getString("to") ?? "en"
        coordinator.enqueue(from: from, to: to, text: nil) { result in
            switch result {
            case .success: call.resolve()
            case .failure(let error): call.reject(error.localizedDescription, "failed")
            }
        }
    }

    @objc func translate(_ call: CAPPluginCall) {
        guard let text = call.getString("text"), !text.isEmpty else {
            call.reject("Nothing to translate", "failed")
            return
        }
        let from = call.getString("from") ?? "es"
        let to = call.getString("to") ?? "en"
        coordinator.enqueue(from: from, to: to, text: text) { result in
            switch result {
            case .success(let translated): call.resolve(["text": translated])
            case .failure(let error): call.reject(error.localizedDescription, "failed")
            }
        }
    }
}

final class TranslatorCoordinator: ObservableObject {
    struct Job {
        let text: String?
        let completion: (Result<String, Error>) -> Void
    }

    @Published var configuration: TranslationSession.Configuration?
    private var pending: [Job] = []
    private var draining = false
    private let lock = NSLock()

    func enqueue(from: String, to: String, text: String?, completion: @escaping (Result<String, Error>) -> Void) {
        lock.lock()
        pending.append(Job(text: text, completion: completion))
        let busy = draining
        lock.unlock()
        DispatchQueue.main.async {
            // A running drain picks the job up; otherwise (re)start the translation task.
            if busy { return }
            let source = Locale.Language(identifier: from)
            let target = Locale.Language(identifier: to)
            if var current = self.configuration, current.source == source, current.target == target {
                current.invalidate()
                self.configuration = current
            } else {
                self.configuration = TranslationSession.Configuration(source: source, target: target)
            }
        }
    }

    @MainActor
    func drain(_ session: TranslationSession) async {
        lock.lock()
        draining = true
        lock.unlock()
        defer {
            lock.lock()
            draining = false
            lock.unlock()
        }
        while true {
            lock.lock()
            let job = pending.isEmpty ? nil : pending.removeFirst()
            lock.unlock()
            guard let job = job else { return }
            do {
                if let text = job.text {
                    let response = try await session.translate(text)
                    job.completion(.success(response.targetText))
                } else {
                    try await session.prepareTranslation()
                    job.completion(.success(""))
                }
            } catch {
                job.completion(.failure(error))
            }
        }
    }
}

struct TranslatorHost: View {
    @ObservedObject var coordinator: TranslatorCoordinator

    var body: some View {
        Color.clear
            .frame(width: 1, height: 1)
            .translationTask(coordinator.configuration) { session in
                await coordinator.drain(session)
            }
    }
}
