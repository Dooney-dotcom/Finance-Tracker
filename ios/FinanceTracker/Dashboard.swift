// The iOS counterpart of web/src/Dashboard.tsx, with Swift Charts in place of the hand-drawn SVG.
import Charts
import SwiftUI

struct DashboardView: View {
  @State private var period = Period.MONTH
  @State private var date = Date.now
  @State private var data: DashboardData?
  @State private var error: String?

  var body: some View {
    NavigationStack {
      List {
        Section {
          Picker("Period", selection: $period) {
            ForEach(Period.allCases, id: \.self) { Text($0.rawValue.capitalized) }
          }.pickerStyle(.segmented)
          Stepper(data.map { periodLabel(period, $0.start, $0.end) } ?? " ") {
            date = shift(date, period, by: 1)
          } onDecrement: { date = shift(date, period, by: -1) }
        }
        if let error { ErrorRow(error) { Task { await load() } } }
        if let d = data {
          Section("Balance") {
            LabeledContent("Income", value: d.totals.income.eur)
            LabeledContent("Expenses", value: d.totals.expense.eur)
            LabeledContent("Left", value: d.totals.net.eur).bold()
            LabeledContent("Net this year", value: d.netYearToDate.eur).foregroundStyle(.secondary)
          }
          if d.trend.count > 1 {
            Section("Trend") {
              Chart(d.trend) { p in
                BarMark(x: .value("When", p.key), y: .value("Amount", p.income))
                  .foregroundStyle(by: .value("Type", "Income")).position(by: .value("Type", "Income"))
                BarMark(x: .value("When", p.key), y: .value("Amount", p.expense))
                  .foregroundStyle(by: .value("Type", "Expenses")).position(by: .value("Type", "Expenses"))
              }
              .chartForegroundStyleScale(["Income": Color.blue, "Expenses": Color.red])
              .chartXAxis(.hidden)
              .frame(height: 180)
            }
          }
          slices("Where it went", d.categories)
          slices("Paid with", d.paymentMethods)
        }
      }
      .navigationTitle("Dashboard")
      .task(id: "\(period)|\(iso(date))") { await load() }
      .refreshable { await load() }
    }
  }

  @ViewBuilder
  func slices(_ title: String, _ items: [Slice]) -> some View {
    if !items.isEmpty {
      Section(title) {
        Chart(items) { s in
          BarMark(x: .value("Amount", s.amount), y: .value("Name", s.name ?? "None"))
            .foregroundStyle(Color(hex: s.color))
        }
        .frame(height: CGFloat(items.count) * 28)
        ForEach(items) { s in LabeledContent(s.name ?? "None", value: s.amount.eur) }
      }
    }
  }

  func load() async {
    do { (data, error) = (try await api("/api/dashboard?period=\(period.rawValue)&date=\(iso(date))"), nil) }
    catch { if let m = message(error) { self.error = m } }
  }
}
