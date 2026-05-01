// swift-tools-version:5.5
import PackageDescription

let package = Package(
    name: "YouLearn",
    platforms: [.macOS(.v11)],
    targets: [
        .executableTarget(name: "YouLearn", path: "Sources/YouLearn")
    ]
)
