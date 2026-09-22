// swift-tools-version: 6.2
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v26)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.2"),
        .package(name: "CapacitorCommunityTextToSpeech", path: "../../../node_modules/.pnpm/@capacitor-community+text-t_d349145cef8c20ac4278c97f555ecba0/node_modules/@capacitor-community/text-to-speech"),
        .package(name: "CapacitorApp", path: "../../../node_modules/.pnpm/@capacitor+app@8.1.1_@capacitor+core@8.5.2/node_modules/@capacitor/app"),
        .package(name: "CapacitorClipboard", path: "../../../node_modules/.pnpm/@capacitor+clipboard@8.0.1_@capacitor+core@8.5.2/node_modules/@capacitor/clipboard"),
        .package(name: "CapacitorKeyboard", path: "../../../node_modules/.pnpm/@capacitor+keyboard@8.0.5_@capacitor+core@8.5.2/node_modules/@capacitor/keyboard")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCommunityTextToSpeech", package: "CapacitorCommunityTextToSpeech"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorClipboard", package: "CapacitorClipboard"),
                .product(name: "CapacitorKeyboard", package: "CapacitorKeyboard")
            ]
        )
    ]
)
