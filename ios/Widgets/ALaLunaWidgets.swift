import AppIntents
import SwiftUI
import WidgetKit

/// Lock-screen widgets, a home-screen widget and Control Centre / lock-screen
/// controls that deep-link into the app's translate screen (SPEC-NATIVE §6).
/// They carry no data, so no App Group is needed.

enum Direction: String, CaseIterable {
    case enEs = "en-es"
    case esEn = "es-en"

    var url: URL { URL(string: "alaluna://translate?dir=\(rawValue)")! }
    var short: String { self == .enEs ? "EN→ES" : "ES→EN" }
    var title: String { self == .enEs ? "English → Spanish" : "Spanish → English" }
    var symbol: String { self == .enEs ? "character.bubble" : "character.bubble.fill" }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
}

struct StaticProvider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry { SimpleEntry(date: .now) }
    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> Void) { completion(SimpleEntry(date: .now)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<SimpleEntry>) -> Void) {
        completion(Timeline(entries: [SimpleEntry(date: .now)], policy: .never))
    }
}

struct DirectionView: View {
    @Environment(\.widgetFamily) private var family
    let direction: Direction

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    VStack(spacing: 1) {
                        Image(systemName: direction.symbol).font(.title3)
                        Text(direction.short).font(.system(size: 9, weight: .semibold))
                    }
                }
            case .accessoryRectangular:
                HStack {
                    Image(systemName: direction.symbol).font(.title2)
                    VStack(alignment: .leading) {
                        Text("Translate").font(.headline)
                        Text(direction.title).font(.caption)
                    }
                }
            default:
                VStack(alignment: .leading, spacing: 6) {
                    Image(systemName: direction.symbol).font(.largeTitle)
                    Spacer()
                    Text("Translate").font(.headline)
                    Text(direction.title).font(.caption).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .widgetURL(direction.url)
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

struct TranslateEnEsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "in.fabricius.vocab.translate.enEs", provider: StaticProvider()) { _ in
            DirectionView(direction: .enEs)
        }
        .configurationDisplayName("Translate EN → ES")
        .description("Opens the translator, English to Spanish.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .systemSmall])
    }
}

struct TranslateEsEnWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "in.fabricius.vocab.translate.esEn", provider: StaticProvider()) { _ in
            DirectionView(direction: .esEn)
        }
        .configurationDisplayName("Translate ES → EN")
        .description("Opens the translator, Spanish to English.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .systemSmall])
    }
}

struct BothDirectionsView: View {
    var body: some View {
        HStack(spacing: 12) {
            ForEach(Direction.allCases, id: \.self) { d in
                Link(destination: d.url) {
                    VStack(spacing: 6) {
                        Image(systemName: d.symbol).font(.title)
                        Text(d.short).font(.headline)
                        Text(d.title).font(.caption2).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(.fill.secondary, in: RoundedRectangle(cornerRadius: 14))
                }
            }
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

struct TranslateHomeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "in.fabricius.vocab.translate.both", provider: StaticProvider()) { _ in
            BothDirectionsView()
        }
        .configurationDisplayName("Translate")
        .description("Both directions.")
        .supportedFamilies([.systemMedium])
    }
}

// MARK: - Controls (lock-screen corners, Control Centre)

struct OpenTranslateIntent: AppIntent {
    static let title: LocalizedStringResource = "Open translator"
    static let description = IntentDescription("Opens ¡A la luna! on the translate screen.")
    static let openAppWhenRun = true

    @Parameter(title: "Direction")
    var direction: String

    init() {
        direction = Direction.enEs.rawValue
    }

    init(direction: Direction) {
        self.direction = direction.rawValue
    }

    func perform() async throws -> some IntentResult & OpensIntent {
        let url = (Direction(rawValue: direction) ?? .enEs).url
        return .result(opensIntent: OpenURLIntent(url))
    }
}

struct TranslateEnEsControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "in.fabricius.vocab.control.enEs") {
            ControlWidgetButton(action: OpenTranslateIntent(direction: .enEs)) {
                Label("EN → ES", systemImage: Direction.enEs.symbol)
            }
        }
        .displayName("Translate EN → ES")
        .description("Opens the translator, English to Spanish.")
    }
}

struct TranslateEsEnControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "in.fabricius.vocab.control.esEn") {
            ControlWidgetButton(action: OpenTranslateIntent(direction: .esEn)) {
                Label("ES → EN", systemImage: Direction.esEn.symbol)
            }
        }
        .displayName("Translate ES → EN")
        .description("Opens the translator, Spanish to English.")
    }
}

@main
struct ALaLunaWidgets: WidgetBundle {
    var body: some Widget {
        TranslateEnEsWidget()
        TranslateEsEnWidget()
        TranslateHomeWidget()
        TranslateEnEsControl()
        TranslateEsEnControl()
    }
}
