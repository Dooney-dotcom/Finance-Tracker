// The iOS counterpart of web/src/Auth.tsx and Account.tsx.
import Supabase
import SwiftUI

struct SignInView: View {
  @State private var email = ""
  @State private var password = ""
  @State private var error: String?
  @State private var notice: String?
  @State private var busy = false

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Email", text: $email).textContentType(.username).keyboardType(.emailAddress)
            .textInputAutocapitalization(.never).autocorrectionDisabled()
          SecureField("Password", text: $password).textContentType(.password)
        }
        if let m = error ?? AppSession.shared.notice { Text(m).foregroundStyle(.red) }
        if let notice { Text(notice).foregroundStyle(.secondary) }
        Button("Sign in") { Task { await signIn() } }.disabled(busy || email.isEmpty || password.isEmpty)
        Button("Forgot password?") { Task { await reset() } }.disabled(busy || email.isEmpty)
      }
      .navigationTitle("Finance Tracker")
    }
  }

  func signIn() async {
    busy = true; error = nil; AppSession.shared.notice = nil
    do { try await supabase.auth.signIn(email: email, password: password) }
    // Same message whether the email exists or not.
    catch { self.error = (error as? AuthError)?.errorCode == .overRequestRateLimit
      ? "Too many attempts. Wait a minute and try again." : "That email and password don’t match an account." }
    busy = false
  }

  /// The link opens the web app, which handles setting the new password.
  func reset() async {
    busy = true; error = nil
    try? await supabase.auth.resetPasswordForEmail(email)
    notice = "If that email has an account, a reset link is on its way."
    busy = false
  }
}

struct MfaView: View {
  @State private var code = ""
  @State private var error: String?
  @State private var busy = false

  var body: some View {
    NavigationStack {
      Form {
        Section("Enter the 6-digit code from your authenticator app") {
          TextField("Code", text: $code).textContentType(.oneTimeCode).keyboardType(.numberPad)
        }
        if let error { Text(error).foregroundStyle(.red) }
        Button("Verify") { Task { await verify() } }.disabled(busy || code.count < 6)
        Button("Sign out", role: .destructive) { Task { try? await supabase.auth.signOut(scope: .local) } }
      }
      .navigationTitle("Two-factor check")
    }
  }

  func verify() async {
    busy = true; error = nil
    do {
      guard let factor = try await supabase.auth.mfa.listFactors().totp.first(where: { $0.status == .verified }) else {
        error = "No authenticator is set up for this account."; busy = false; return
      }
      try await supabase.auth.mfa.challengeAndVerify(params: .init(factorId: factor.id, code: code.filter(\.isNumber)))
    } catch { self.error = "That code didn’t work. Check the time on your device and try again." }
    busy = false
  }
}

struct AccountView: View {
  @State private var password = ""
  @State private var status: String?

  var body: some View {
    NavigationStack {
      Form {
        Section("Signed in as") { Text(AppSession.shared.email) }
        Section("Change password") {
          SecureField("New password", text: $password).textContentType(.newPassword)
          Button("Save password") {
            Task {
              do { try await supabase.auth.update(user: UserAttributes(password: password)); password = ""; status = "Password changed." }
              catch { status = error.localizedDescription }
            }
          }.disabled(password.count < 8)
          if let status { Text(status).foregroundStyle(.secondary) }
        }
        Button("Sign out", role: .destructive) { Task { try? await supabase.auth.signOut(scope: .local) } }
      }
      .navigationTitle("Account")
    }
  }
}
