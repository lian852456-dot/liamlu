import SwiftUI

@main
struct LiamSupervisorApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model = SupervisorWebModel()

    var body: some Scene {
        WindowGroup {
            ContentView(model: model)
                .preferredColorScheme(.dark)
                .onChange(of: scenePhase) { phase in
                    if phase == .active {
                        model.resumeIfNeeded()
                    }
                }
        }
    }
}
