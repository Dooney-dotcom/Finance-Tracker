package app.financetracker.api;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Parses Revolut's account-statement CSV (Italian or English headers) into importable rows. Pure: no I/O. */
public final class RevolutCsv {

	private RevolutCsv() {}

	public enum Status { NEW, SKIPPED, FLAGGED }

	/** startedAt is Europe/Rome wall time, as Revolut writes it. amount is positive; income says which way it went. */
	public record Line(int line, LocalDateTime startedAt, String description, BigDecimal amount, boolean income,
			Status status, String reason) {}

	private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

	// Each field, by Italian and English header.
	private static final Map<String, String> HEADERS = Map.ofEntries(
		Map.entry("tipo", "type"), Map.entry("type", "type"),
		Map.entry("data di inizio", "started"), Map.entry("started date", "started"),
		Map.entry("descrizione", "description"), Map.entry("description", "description"),
		Map.entry("importo", "amount"), Map.entry("amount", "amount"),
		Map.entry("costo", "fee"), Map.entry("fee", "fee"),
		Map.entry("valuta", "currency"), Map.entry("currency", "currency"),
		Map.entry("state", "state"), Map.entry("stato", "state"));

	public static List<Line> parse(String csv) {
		List<List<String>> rows = split(csv.startsWith("﻿") ? csv.substring(1) : csv);
		if (rows.isEmpty()) throw new IllegalArgumentException("The file is empty.");
		Map<String, Integer> col = new HashMap<>();
		List<String> header = rows.get(0);
		for (int i = 0; i < header.size(); i++) {
			String f = HEADERS.get(header.get(i).trim().toLowerCase(Locale.ROOT));
			if (f != null) col.putIfAbsent(f, i);
		}
		for (String need : List.of("type", "started", "description", "amount", "currency", "state")) {
			if (!col.containsKey(need)) throw new IllegalArgumentException("This doesn’t look like a Revolut statement export (missing columns).");
		}

		List<Line> out = new ArrayList<>();
		for (int r = 1; r < rows.size(); r++) {
			List<String> row = rows.get(r);
			if (row.size() == 1 && row.get(0).isBlank()) continue;
			int line = r + 1;
			try {
				String type = norm(get(row, col, "type"));
				String state = norm(get(row, col, "state"));
				String description = get(row, col, "description").trim();
				BigDecimal raw = new BigDecimal(get(row, col, "amount").trim());
				String fee = col.containsKey("fee") ? get(row, col, "fee").trim() : "";
				BigDecimal amount = raw.abs().add(fee.isEmpty() || raw.signum() > 0 ? BigDecimal.ZERO : new BigDecimal(fee).abs());
				LocalDateTime started = LocalDateTime.parse(get(row, col, "started").trim(), TS);
				boolean income = raw.signum() > 0;

				Status status = Status.NEW;
				String reason = null;
				if (!state.equals("completato") && !state.equals("completed")) { status = Status.SKIPPED; reason = "Not completed (" + get(row, col, "state").trim().toLowerCase(Locale.ROOT) + ")"; }
				else if (type.equals("ricarica") || type.equals("topup")) { status = Status.SKIPPED; reason = "Top-up between your own accounts"; }
				else if (raw.signum() == 0) { status = Status.SKIPPED; reason = "Zero amount"; }
				else if (!get(row, col, "currency").trim().equalsIgnoreCase("EUR")) { status = Status.FLAGGED; reason = "Not in EUR (" + get(row, col, "currency").trim() + "); add it by hand"; }
				out.add(new Line(line, started, description, amount, income, status, reason));
			} catch (RuntimeException e) {
				out.add(new Line(line, null, String.join(",", row), null, false, Status.FLAGGED, "Couldn’t read this row"));
			}
		}
		return out;
	}

	private static String get(List<String> row, Map<String, Integer> col, String field) {
		int i = col.get(field);
		return i < row.size() ? row.get(i) : "";
	}

	private static String norm(String s) {
		return s.toLowerCase(Locale.ROOT).replaceAll("[^a-zà-ù ]", "").trim();
	}

	/** RFC 4180: commas, quoted fields, doubled quotes, CRLF. */
	static List<List<String>> split(String s) {
		List<List<String>> rows = new ArrayList<>();
		List<String> row = new ArrayList<>();
		StringBuilder f = new StringBuilder();
		boolean quoted = false;
		for (int i = 0; i < s.length(); i++) {
			char c = s.charAt(i);
			if (quoted) {
				if (c == '"' && i + 1 < s.length() && s.charAt(i + 1) == '"') { f.append('"'); i++; }
				else if (c == '"') quoted = false;
				else f.append(c);
			} else if (c == '"') quoted = true;
			else if (c == ',') { row.add(f.toString()); f.setLength(0); }
			else if (c == '\n' || c == '\r') {
				if (c == '\r' && i + 1 < s.length() && s.charAt(i + 1) == '\n') i++;
				row.add(f.toString()); f.setLength(0); rows.add(row); row = new ArrayList<>();
			} else f.append(c);
		}
		if (f.length() > 0 || !row.isEmpty()) { row.add(f.toString()); rows.add(row); }
		return rows;
	}
}
