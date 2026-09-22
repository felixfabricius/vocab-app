import UIKit
import Capacitor

/// The app's bridge view controller. Custom (in-app) plugins are registered here;
/// npm plugins are registered by Capacitor from the generated package list.
class ViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SpeechPlugin())
        bridge?.registerPluginInstance(TranslatePlugin())
    }
}
