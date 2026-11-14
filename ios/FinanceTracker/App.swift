// The iOS counterpart of web/src/App.tsx: auth gate, tabs, idle timeout.
import Supabase
import SwiftUI

@Observable
final class AppSession {
  static let shared = AppSession()
  enum Gate { case loading, signedOut, mfa, signedIn }
  var gate = Gate.loading
  var email = ""
  var notice: String?

  func listen() async {
    for await (_, session) in supabase.auth.authStateChanges { await decide(session) }
  }

  func decide(_ s: Session?) async {
    guard let s else { gate = .signedOut; return }
    email = s.user.email ?? ""
    let aal = try? await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    gate = aal?.nextLevel == "aal2" && aal?.currentLevel != "aal2" ? .mfa : .signedIn
  }

  /// Local scope: ends this device's session, leaves other devices signed in.
  func expire(_ why: String = "Your session expired after a period of inactivity. Sign in again.") {
    guard gate != .signedOut else { return }
    notice = why
    Task { try? await supabase.auth.signOut(scope: .local) }
  }
}

/// Keep equal to the API's SESSION_IDLE_TIMEOUT (and the web's VITE_SESSION_IDLE_MINUTES).
private let idleLimit: TimeInterval = 30 * 60

@main
struct FinanceTrackerApp: App {
  @State private var session = AppSession.shared
  @State private var backgroundedAt: Date?
  @Environment(\.scenePhase) private var phase

  var body: some Scene {
    WindowGroup {
      Group {
        switch session.gate {
        case .loading: ProgressView()
        case .signedOut: SignInView()
        case .mfa: MfaView()
        case .signedIn: MainTabs()
        }
      }
      .task { await session.listen() }
      // ponytail: idle is measured across background time only, not untouched foreground time;
      // the API still refuses a session idle for too long, and that 401 signs the app out.
      .onChange(of: phase) { _, now in
        guard session.gate == .signedIn else { return }
        if now == .background { backgroundedAt = .now }
        if now == .active {
          if let t = backgroundedAt, Date.now.timeIntervalSince(t) > idleLimit { session.expire() }
          else { Task { try? await call("/api/session", method: "POST") } }
          backgroundedAt = nil
        }
      }
    }
  }
}

struct MainTabs: View {
  var body: some View {
    TabView {
      Tab("Dashboard", systemImage: "chart.pie") { DashboardView() }
      Tab("Records", systemImage: "list.bullet.rectangle") { RecordsView() }
      Tab("Calendar", systemImage: "calendar") { CalendarView() }
      Tab("Wealth", systemImage: "building.columns") { WealthView() }
      Tab("Account", systemImage: "person.crop.circle") { AccountView() }
    }
  }
}
