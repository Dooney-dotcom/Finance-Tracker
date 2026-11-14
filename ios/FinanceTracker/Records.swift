// The iOS counterpart of web/src/Records.tsx: records by month, search, add, edit and delete.
import SwiftUI

/// Query string with every value fully escaped (search text may contain & or +).
func query(_ items: [String: String?]) -> String {
  let safe = CharacterSet.alphanumerics.union(.init(charactersIn: "-._~"))
  return items.compactMap { k, v in v.map { "\(k)=\($0.addingPercentEncoding(withAllowedCharacters: safe)!)" } }
    .sorted().joined(separator: "&")
}

struct Records: Decodable { var records: [Rec] }

struct RecordsView: View {
  @State private var month = Date.now
  @State private var search = ""
  @State private var rows: [Rec]?
  @State private var lists = Lists()
  @State private var error: String?
  @State private var editing: Rec?
  @State private var reload = 0

  var body: some View {
    NavigationStack {
      List {
        Section {
          Stepper(month.formatted(.dateTime.month(.wide).year())) { step(1) } onDecrement: { step(-1) }
          if let rows {
            let income = rows.filter { $0.type == "Income" }.reduce(0) { $0 + $1.amount }
            let expense = rows.filter { $0.type == "Expense" }.reduce(0) { $0 + $1.amount }
            LabeledContent("\(rows.count) records", value: "+\(income.eur) · −\(expense.eur)").foregroundStyle(.secondary)
          }
        }
        if let error { ErrorRow(error) { reload += 1 } }
        if rows == nil, error == nil { ProgressView() }
        ForEach(groups(rows ?? []), id: \.title) { g in
          Section(g.title) {
            ForEach(g.recs) { r in
              Button { editing = r } label: { RecordRow(rec: r, lists: lists) }
                .swipeActions { Button("Delete", role: .destructive) { Task { await delete(r) } } }
            }
          }
        }
      }
      .navigationTitle("Records")
      .searchable(text: $search)
      .toolbar { Button("Add", systemImage: "plus") { editing = .new(on: .now) } }
      .sheet(item: $editing) { RecordForm(rec: $0, lists: lists) { reload += 1 } }
      .task(id: "\(monthStart(month))|\(search)|\(reload)") { await load() }
      .refreshable { await load() }
    }
  }

  func step(_ n: Int) { month = shift(month, .MONTH, by: n) }

  func load() async {
    if !search.isEmpty { try? await Task.sleep(for: .milliseconds(250)) }  // debounce typing
    let m = monthStart(month)
    do {
      async let l: Lists = api("/api/lists")
      async let r: Records = api("/api/records?" + query(["monthFrom": m, "monthTo": m, "q": search.isEmpty ? nil : search]))
      (lists, rows, error) = (try await l, try await r.records, nil)
    } catch { if let m = message(error) { self.error = m } }
  }

  func delete(_ r: Rec) async {
    do { try await call("/api/records/\(r.id!)", method: "DELETE"); reload += 1 }
    catch { self.error = message(error) }
  }
}

/// Newest day first; records without an exact date still belong to the month, so they get their own group.
func groups(_ rows: [Rec]) -> [(title: String, recs: [Rec])] {
  let dated = Dictionary(grouping: rows.filter { $0.dateTime != nil }) { String($0.dateTime!.prefix(10)) }
    .sorted { $0.key > $1.key }
    .map { (title: day($0.key).formatted(.dateTime.weekday(.wide).day().month()), recs: $0.value.sorted { $0.dateTime! > $1.dateTime! }) }
  let undated = rows.filter { $0.dateTime == nil }
  return dated + (undated.isEmpty ? [] : [(title: "No exact date", recs: undated)])
}

extension Rec {
  static func new(on d: Date) -> Rec { Rec(dateTime: isoMinute(d), month: monthStart(d)) }
}

struct RecordRow: View {
  let rec: Rec
  let lists: Lists
  var body: some View {
    let cat = lists.category(rec.categoryId)
    HStack {
      Circle().fill(Color(hex: cat?.color)).frame(width: 10, height: 10)
      VStack(alignment: .leading) {
        Text(rec.description).foregroundStyle(.primary)
        Text([cat?.name, lists.method(rec.paymentMethodId)?.name].compactMap { $0 }.joined(separator: " · "))
          .font(.caption).foregroundStyle(.secondary)
      }
      Spacer()
      Text(rec.type == "Income" ? "+" + rec.amount.eur : rec.amount.eur)
        .monospacedDigit().foregroundStyle(rec.type == "Income" ? .blue : .primary)
    }
  }
}

struct ErrorRow: View {
  let text: String
  let retry: () -> Void
  init(_ text: String, retry: @escaping () -> Void) { self.text = text; self.retry = retry }
  var body: some View {
    HStack { Text(text).foregroundStyle(.red); Spacer(); Button("Retry", action: retry) }
  }
}

struct RecordForm: View {
  let original: Rec
  let lists: Lists
  let onSaved: () -> Void
  @State private var rec: Rec
  @State private var amount: String
  @State private var exact: Bool
  @State private var when: Date
  @State private var error: String?
  @State private var busy = false
  @Environment(\.dismiss) private var dismiss

  init(rec: Rec, lists: Lists, onSaved: @escaping () -> Void) {
    original = rec; self.lists = lists; self.onSaved = onSaved
    _rec = State(initialValue: rec)
    _amount = State(initialValue: rec.amount > 0 ? String(format: "%.2f", rec.amount) : "")
    _exact = State(initialValue: rec.dateTime != nil)
    _when = State(initialValue: rec.dateTime.map(minute) ?? day(rec.month))
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Picker("Type", selection: $rec.type) { Text("Expense").tag("Expense"); Text("Income").tag("Income") }
            .pickerStyle(.segmented)
          TextField("Description", text: $rec.description)
          TextField("Amount", text: $amount).keyboardType(.decimalPad)
        }
        Section {
          Toggle("Exact date", isOn: $exact)
          DatePicker(exact ? "When" : "Month", selection: $when, displayedComponents: exact ? [.date, .hourAndMinute] : .date)
        }
        Section {
          optionPicker("Category", $rec.categoryId,
                       lists.categories.filter { $0.kind == (rec.type == "Income" ? "income" : "expense") }.map { ($0.id, $0.name) })
          optionPicker("Paid with", $rec.paymentMethodId, lists.paymentMethods.map { ($0.id, $0.name) })
        }
        if rec.type == "Expense" {
          Section("Behaviour") {
            optionPicker("Avoidable", $rec.avoidable, AVOIDABLE.map { ($0, $0) })
            optionPicker("Recurrence", $rec.recurrence, RECURRENCE.map { ($0, $0) })
            optionPicker("Reason", $rec.reason, REASONS.map { ($0, $0) })
          }
        }
        Section {
          TextField("Notes", text: Binding { rec.notes ?? "" } set: { rec.notes = $0 }, axis: .vertical)
        }
        if let error { Text(error).foregroundStyle(.red) }
        if original.id != nil {
          Button("Delete record", role: .destructive) { Task { await remove() } }.disabled(busy)
        }
      }
      .environment(\.timeZone, rome)
      .navigationTitle(original.id == nil ? "New record" : "Edit record")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) { Button("Save") { Task { await save() } }.disabled(busy) }
      }
      .onChange(of: rec.type) { _, t in
        if lists.category(rec.categoryId)?.kind != (t == "Income" ? "income" : "expense") { rec.categoryId = nil }
      }
    }
  }

  func optionPicker(_ label: String, _ value: Binding<String?>, _ options: [(String, String)]) -> some View {
    Picker(label, selection: value) {
      Text("None").tag(String?.none)
      ForEach(options, id: \.0) { Text($0.1).tag(Optional($0.0)) }
    }
  }

  func save() async {
    var body = rec
    body.description = rec.description.trimmingCharacters(in: .whitespacesAndNewlines)
    let a = Double(amount.replacingOccurrences(of: ",", with: ".")) ?? 0
    guard !body.description.isEmpty else { error = "Add a short description."; return }
    guard a > 0 else { error = "Enter an amount above zero, like 12.50."; return }
    body.amount = (a * 100).rounded() / 100
    body.dateTime = exact ? isoMinute(when) : nil
    body.month = monthStart(when)
    // Keep a record's own month when its date didn't change (e.g. a bill filed under the previous month).
    if original.id != nil, exact, original.dateTime?.prefix(16) == body.dateTime?.prefix(16) { body.month = original.month }
    if body.type == "Income" { body.avoidable = nil; body.recurrence = nil; body.reason = nil }
    body.notes = body.notes?.trimmingCharacters(in: .whitespacesAndNewlines)
    if body.notes == "" { body.notes = nil }

    busy = true; error = nil
    do {
      try await call(original.id.map { "/api/records/\($0)" } ?? "/api/records", method: original.id == nil ? "POST" : "PUT", json: body)
      onSaved(); dismiss()
    } catch { self.error = message(error) }
    busy = false
  }

  func remove() async {
    busy = true
    do { try await call("/api/records/\(original.id!)", method: "DELETE"); onSaved(); dismiss() }
    catch { self.error = message(error); busy = false }
  }
}
