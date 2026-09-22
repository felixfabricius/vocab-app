import Foundation
import AVFoundation
import Capacitor
import Speech

/// On-device speech recognition (SFSpeechRecognizer) for dictation in the translate
/// screen and for "sí / no" grading. Streams partial results as `partial` events and
/// ends with an `end` event; `stop()` resolves with the text heard so far.
@objc(SpeechPlugin)
public class SpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpeechPlugin"
    public let jsName = "Speech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private let audioEngine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var silenceTimer: Timer?
    private var maxTimer: Timer?
    private var lastText = ""
    private var heardSomething = false
    private var listening = false

    @objc func available(_ call: CAPPluginCall) {
        let localeId = call.getString("locale") ?? "es-CL"
        let r = SFSpeechRecognizer(locale: Locale(identifier: localeId))
        call.resolve([
            "available": r?.isAvailable ?? false,
            "onDevice": r?.supportsOnDeviceRecognition ?? false,
            "authorized": SFSpeechRecognizer.authorizationStatus() == .authorized,
        ])
    }

    @objc func requestPermissions(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { status in
            AVAudioApplication.requestRecordPermission { granted in
                call.resolve(["speech": status == .authorized, "microphone": granted])
            }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        let localeId = call.getString("locale") ?? "es-CL"
        let contextual = call.getArray("contextualStrings", String.self) ?? []
        let maxSeconds = call.getDouble("maxSeconds") ?? 30
        let silenceSeconds = call.getDouble("silenceSeconds") ?? 1.5
        let onDevice = call.getBool("onDevice") ?? true
        let hint = call.getString("taskHint") ?? "dictation"

        if listening {
            call.reject("Already listening", "busy")
            return
        }
        guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
            call.reject("Speech recognition is not authorised", "denied")
            return
        }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeId)), recognizer.isAvailable else {
            call.reject("Speech recognition is not available for \(localeId)", "unavailable")
            return
        }

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker, .allowBluetoothHFP])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            call.reject("Audio session: \(error.localizedDescription)", "failed")
            return
        }

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        if onDevice && recognizer.supportsOnDeviceRecognition {
            req.requiresOnDeviceRecognition = true
        }
        if !contextual.isEmpty {
            req.contextualStrings = contextual
        }
        switch hint {
        case "confirmation": req.taskHint = .confirmation
        case "search": req.taskHint = .search
        default: req.taskHint = .dictation
        }

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            req.append(buffer)
        }
        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            input.removeTap(onBus: 0)
            call.reject("Microphone: \(error.localizedDescription)", "failed")
            return
        }

        self.recognizer = recognizer
        self.request = req
        self.lastText = ""
        self.heardSomething = false
        self.listening = true

        task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            guard let self = self, self.listening else { return }
            if let result = result {
                let text = result.bestTranscription.formattedString
                self.lastText = text
                if !text.isEmpty {
                    self.heardSomething = true
                    self.restartSilenceTimer(silenceSeconds)
                }
                self.notifyListeners("partial", data: ["text": text, "isFinal": result.isFinal])
                if result.isFinal {
                    self.finish(reason: "final")
                    return
                }
            }
            if let error = error {
                // "No speech detected" and cancellation arrive as errors; report what we have.
                self.finish(reason: self.heardSomething ? "final" : "error", error: self.heardSomething ? nil : error)
            }
        }

        DispatchQueue.main.async {
            self.maxTimer?.invalidate()
            self.maxTimer = Timer.scheduledTimer(withTimeInterval: maxSeconds, repeats: false) { [weak self] _ in
                self?.finish(reason: "timeout")
            }
        }
        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        let text = lastText
        finish(reason: "stopped")
        call.resolve(["text": text])
    }

    private func restartSilenceTimer(_ seconds: Double) {
        DispatchQueue.main.async {
            self.silenceTimer?.invalidate()
            self.silenceTimer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
                self?.finish(reason: "silence")
            }
        }
    }

    private func finish(reason: String, error: Error? = nil) {
        guard listening else { return }
        listening = false
        DispatchQueue.main.async {
            self.silenceTimer?.invalidate()
            self.maxTimer?.invalidate()
            self.silenceTimer = nil
            self.maxTimer = nil
        }
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        var data: [String: Any] = ["text": lastText, "reason": reason]
        if let error = error {
            data["error"] = error.localizedDescription
        }
        notifyListeners("end", data: data)
    }
}
