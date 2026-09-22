import AVFoundation
import Capacitor
import MediaPlayer
import UIKit

/// Audio session category for review playback / voice review, and the remote command
/// centre (wired EarPods: one click toggle, two clicks next, three clicks previous).
/// Events: `remote { command: "toggle" | "next" | "previous" }`, `interruption { type: "began" | "ended" }`.
@objc(AudioSessionPlugin)
public class AudioSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudioSessionPlugin"
    public let jsName = "AudioSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deactivate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remoteCommands", returnType: CAPPluginReturnPromise),
    ]

    private var targets: [(MPRemoteCommand, Any)] = []
    private var observing = false

    public override func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: AVAudioSession.sharedInstance())
    }

    @objc func configure(_ call: CAPPluginCall) {
        let mode = call.getString("mode") ?? "playback"
        let session = AVAudioSession.sharedInstance()
        do {
            if mode == "playAndRecord" {
                try session.setCategory(.playAndRecord, mode: .spokenAudio, options: [.defaultToSpeaker, .allowBluetoothHFP, .duckOthers])
            } else {
                try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            }
            try session.setActive(true)
            call.resolve(["route": session.currentRoute.outputs.map { $0.portType.rawValue }])
        } catch {
            call.reject("Audio session: \(error.localizedDescription)", "failed")
        }
    }

    @objc func deactivate(_ call: CAPPluginCall) {
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        call.resolve()
    }

    @objc func remoteCommands(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? true
        DispatchQueue.main.async {
            let center = MPRemoteCommandCenter.shared()
            for (command, target) in self.targets {
                command.removeTarget(target)
            }
            self.targets = []
            if enabled {
                UIApplication.shared.beginReceivingRemoteControlEvents()
                let map: [(MPRemoteCommand, String)] = [
                    (center.togglePlayPauseCommand, "toggle"),
                    (center.playCommand, "toggle"),
                    (center.pauseCommand, "toggle"),
                    (center.nextTrackCommand, "next"),
                    (center.previousTrackCommand, "previous"),
                ]
                for (command, name) in map {
                    command.isEnabled = true
                    let target = command.addTarget { [weak self] _ in
                        self?.notifyListeners("remote", data: ["command": name])
                        return .success
                    }
                    self.targets.append((command, target))
                }
                // Being the "now playing" app is what routes the headphone clicks here.
                MPNowPlayingInfoCenter.default().nowPlayingInfo = [
                    MPMediaItemPropertyTitle: "¡A la luna!",
                    MPMediaItemPropertyArtist: "review",
                    MPNowPlayingInfoPropertyPlaybackRate: 1.0,
                    MPNowPlayingInfoPropertyIsLiveStream: true,
                ]
                MPNowPlayingInfoCenter.default().playbackState = .playing
            } else {
                MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
                MPNowPlayingInfoCenter.default().playbackState = .stopped
                UIApplication.shared.endReceivingRemoteControlEvents()
            }
            call.resolve()
        }
    }

    @objc private func interrupted(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        notifyListeners("interruption", data: ["type": type == .began ? "began" : "ended"])
    }
}
