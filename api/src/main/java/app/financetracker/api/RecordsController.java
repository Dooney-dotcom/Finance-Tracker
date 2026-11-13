package app.financetracker.api;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/records")
class RecordsController {

	static final ZoneId ROME = ZoneId.of("Europe/Rome");
	private static final Set<String> AVOIDABLE = Set.of("Yes", "Partly", "No");
	private static final Set<String> RECURRENCE = Set.of("Fixed", "Recurring", "One-off");
	private static final Set<String> REASONS = Set.of("Impulse", "Boredom", "Stress", "Social / FOMO", "Discount", "Convenience", "Habit");
	private static final int LIMIT = 2000;

	/** `dateTime` is Europe/Rome wall time; null when the exact date is unknown. */
	record Rec(UUID id, String description, BigDecimal amount, String type, LocalDateTime dateTime, LocalDate month,
			UUID categoryId, UUID paymentMethodId, String avoidable, String recurrence, String reason, String notes) {}

	record Page(List<Rec> records, boolean truncated) {}

	private final UserDb db;

	RecordsController(UserDb db) {
		this.db = db;
	}

	static UUID user(Jwt jwt) {
		return UUID.fromString(jwt.getSubject());
	}

	static ResponseStatusException bad(String message) {
		return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
	}

	@GetMapping
	Page list(@AuthenticationPrincipal Jwt jwt,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate monthFrom,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate monthTo,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
			@RequestParam(required = false) String category,
			@RequestParam(required = false) String paymentMethod,
			@RequestParam(required = false) String type,
			@RequestParam(required = false) String avoidable,
			@RequestParam(required = false) String recurrence,
			@RequestParam(required = false) String q) {
		UUID uid = user(jwt);
		StringBuilder where = new StringBuilder("t.user_id = :uid");
		Map<String, Object> p = new HashMap<>(Map.of("uid", uid));
		if (monthFrom != null) { where.append(" and t.month >= :mf"); p.put("mf", monthFrom.withDayOfMonth(1)); }
		if (monthTo != null) { where.append(" and t.month <= :mt"); p.put("mt", monthTo.withDayOfMonth(1)); }
		if (dateFrom != null) { where.append(" and (t.date at time zone 'Europe/Rome')::date >= :df"); p.put("df", dateFrom); }
		if (dateTo != null) { where.append(" and (t.date at time zone 'Europe/Rome')::date <= :dt"); p.put("dt", dateTo); }
		filterId(where, p, "t.category_id", "cat", category);
		filterId(where, p, "t.payment_method_id", "pm", paymentMethod);
		if (type != null) { where.append(" and t.type = cast(:type as transaction_type)"); p.put("type", checkType(type)); }
		if ("untagged".equals(avoidable)) where.append(" and t.type = 'Expense' and t.avoidable is null");
		else if (avoidable != null) { where.append(" and t.avoidable = cast(:av as avoidable_level)"); p.put("av", checkIn(avoidable, AVOIDABLE, "avoidable")); }
		if ("untagged".equals(recurrence)) where.append(" and t.type = 'Expense' and t.recurrence is null");
		else if (recurrence != null) { where.append(" and t.recurrence = :rec"); p.put("rec", checkIn(recurrence, RECURRENCE, "recurrence")); }
		if (q != null && !q.isBlank()) {
			where.append(" and (position(lower(:q) in lower(t.description)) > 0 or position(lower(:q) in lower(coalesce(t.notes, ''))) > 0)");
			p.put("q", q.trim());
		}
		String sql = """
				select t.id, t.description, t.amount, t.type::text, (t.date at time zone 'Europe/Rome'), t.month,
				       t.category_id, t.payment_method_id, t.avoidable::text, t.recurrence, t.reason::text, t.notes
				from transactions t where %s
				order by coalesce(t.date, t.month::timestamptz) desc, t.created_at desc
				limit %d""".formatted(where, LIMIT + 1);
		List<Rec> rows = db.run(jwt, s -> s.sql(sql).params(p).query((rs, i) -> new Rec(
			rs.getObject(1, UUID.class), rs.getString(2), rs.getBigDecimal(3), rs.getString(4),
			rs.getObject(5, LocalDateTime.class), rs.getObject(6, LocalDate.class),
			rs.getObject(7, UUID.class), rs.getObject(8, UUID.class), rs.getString(9), rs.getString(10), rs.getString(11), rs.getString(12))).list());
		boolean truncated = rows.size() > LIMIT;
		return new Page(truncated ? rows.subList(0, LIMIT) : rows, truncated);
	}

	private static void filterId(StringBuilder where, Map<String, Object> p, String column, String key, String value) {
		if (value == null) return;
		if (value.equals("none")) { where.append(" and ").append(column).append(" is null"); return; }
		try { p.put(key, UUID.fromString(value)); } catch (IllegalArgumentException e) { throw bad("Unknown filter value."); }
		where.append(" and ").append(column).append(" = :").append(key);
	}

	@PostMapping
	@org.springframework.web.bind.annotation.ResponseStatus(HttpStatus.CREATED)
	Map<String, UUID> create(@AuthenticationPrincipal Jwt jwt, @RequestBody Rec in) {
		Rec r = validate(in);
		UUID uid = user(jwt);
		try {
			return db.run(jwt, s -> {
				checkCategoryKind(s, r);
				UUID id = s.sql("""
						insert into transactions (user_id, description, amount, type, date, month, category_id, payment_method_id, avoidable, recurrence, reason, notes)
						values (:uid, :d, :a, cast(:type as transaction_type), cast(:date as timestamptz), :month, cast(:cat as uuid), cast(:pm as uuid),
						        cast(:av as avoidable_level), :rec, cast(:reason as spending_reason), :notes)
						returning id""")
					.params(params(uid, r)).query(UUID.class).single();
				return Map.of("id", id);
			});
		} catch (DuplicateKeyException e) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "An identical record already exists.");
		}
	}

	@PutMapping("/{id}")
	void update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestBody Rec in) {
		Rec r = validate(in);
		UUID uid = user(jwt);
		int n;
		try {
			n = db.run(jwt, s -> {
				checkCategoryKind(s, r);
				Map<String, Object> p = params(uid, r);
				p.put("id", id);
				return s.sql("""
						update transactions set description = :d, amount = :a, type = cast(:type as transaction_type),
						  date = cast(:date as timestamptz), month = :month, category_id = cast(:cat as uuid), payment_method_id = cast(:pm as uuid),
						  avoidable = cast(:av as avoidable_level), recurrence = :rec, reason = cast(:reason as spending_reason), notes = :notes
						where id = :id and user_id = :uid""").params(p).update();
			});
		} catch (DuplicateKeyException e) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "An identical record already exists.");
		}
		if (n == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
	}

	@DeleteMapping("/{id}")
	ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
		UUID uid = user(jwt);
		int n = db.run(jwt, s -> s.sql("delete from transactions where id = :id and user_id = :uid").param("id", id).param("uid", uid).update());
		if (n == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
		return ResponseEntity.noContent().build();
	}

	// ---------- Revolut CSV import ----------

	record PreviewLine(int line, LocalDateTime dateTime, String description, BigDecimal amount, String type,
			String status, String reason, UUID suggestedCategoryId) {}

	/** Parses the file and says, per row, whether it would be added and why not. Writes nothing. */
	@PostMapping("/import/revolut/preview")
	List<PreviewLine> preview(@AuthenticationPrincipal Jwt jwt, @RequestPart("file") MultipartFile file) throws IOException {
		if (file.getSize() > 2_000_000) throw bad("That file is larger than 2 MB. Export a shorter period.");
		List<RevolutCsv.Line> lines;
		try {
			lines = RevolutCsv.parse(new String(file.getBytes(), StandardCharsets.UTF_8));
		} catch (IllegalArgumentException e) {
			throw bad(e.getMessage());
		}
		UUID uid = user(jwt);
		return db.run(jwt, s -> {
			UUID revolut = s.sql("select id from payment_methods where user_id = :uid and lower(name) = 'revolut'")
				.param("uid", uid).query(UUID.class).optional().orElse(null);
			Set<String> existing = new HashSet<>();
			if (revolut != null) {
				s.sql("""
						select type::text, (date at time zone 'Europe/Rome'), amount, description from transactions
						where user_id = :uid and payment_method_id = :pm and date is not null""")
					.param("uid", uid).param("pm", revolut)
					.query(rs -> { existing.add(key(rs.getString(1).equals("Income"), rs.getObject(2, LocalDateTime.class), rs.getBigDecimal(3), rs.getString(4))); });
			}
			// Last category used for each description and direction: a suggestion only.
			Map<String, UUID> lastCategory = new HashMap<>();
			s.sql("""
					select distinct on (lower(description), type) lower(description), type::text, category_id
					from transactions where user_id = :uid and category_id is not null
					order by lower(description), type, coalesce(date, month::timestamptz) desc""")
				.param("uid", uid)
				.query(rs -> { lastCategory.put(rs.getString(1) + "|" + rs.getString(2), rs.getObject(3, UUID.class)); });

			List<PreviewLine> out = new ArrayList<>();
			for (RevolutCsv.Line l : lines) {
				String type = l.income() ? "Income" : "Expense";
				String status = l.status().name();
				String reason = l.reason();
				if (l.status() == RevolutCsv.Status.NEW && !existing.add(key(l.income(), l.startedAt(), l.amount(), l.description()))) {
					status = "DUPLICATE";
					reason = "Already recorded";
				}
				UUID suggestion = l.description() == null ? null : lastCategory.get(l.description().toLowerCase(Locale.ROOT) + "|" + type);
				out.add(new PreviewLine(l.line(), l.startedAt(), l.description(), l.amount(), type, status, reason, suggestion));
			}
			return out;
		});
	}

	private static String key(boolean income, LocalDateTime at, BigDecimal amount, String description) {
		return income + "|" + at.withNano(0) + "|" + amount.stripTrailingZeros().toPlainString() + "|" + description;
	}

	record ImportRow(LocalDateTime dateTime, String description, BigDecimal amount, String type, UUID categoryId) {}

	record ImportResult(int added, int alreadyThere) {}

	/** Adds the rows the user confirmed, as Revolut payments. Rows already present are skipped by the database. */
	@PostMapping("/import/revolut")
	ImportResult importRows(@AuthenticationPrincipal Jwt jwt, @RequestBody List<ImportRow> rows) {
		if (rows.isEmpty() || rows.size() > 5000) throw bad("Nothing to import, or too many rows at once.");
		List<Rec> recs = rows.stream().map(r -> {
			if (r.dateTime() == null) throw bad("Every imported row needs a date.");
			return validate(new Rec(null, r.description(), r.amount(), r.type(), r.dateTime(), null, r.categoryId(), null, null, null, null, null));
		}).toList();
		UUID uid = user(jwt);
		return db.run(jwt, s -> {
			UUID revolut = s.sql("select id from payment_methods where user_id = :uid and lower(name) = 'revolut'")
				.param("uid", uid).query(UUID.class).optional()
				.orElseGet(() -> s.sql("insert into payment_methods (user_id, name) values (:uid, 'Revolut') returning id")
					.param("uid", uid).query(UUID.class).single());
			// One lookup for every category used, one insert for every row: a fixed number of round trips at any size.
			Map<UUID, String> kinds = new HashMap<>();
			List<String> catIds = recs.stream().map(Rec::categoryId).filter(Objects::nonNull).distinct().map(UUID::toString).toList();
			if (!catIds.isEmpty()) s.sql("select id, kind from categories where id = any(cast(:ids as uuid[]))").param("ids", catIds.toArray(String[]::new))
				.query(rs -> { kinds.put(rs.getObject(1, UUID.class), rs.getString(2)); });
			for (Rec r : recs) checkCategoryKind(kinds, r);
			List<Map<String, Object>> ps = recs.stream().map(r -> params(uid, r)).toList();
			int added = s.sql("""
					insert into transactions (user_id, description, amount, type, date, month, category_id, payment_method_id)
					select :uid, d, cast(a as numeric), cast(t as transaction_type), cast(dt as timestamptz), cast(m as date), cast(c as uuid), :pm
					from unnest(cast(:d as text[]), cast(:a as text[]), cast(:t as text[]), cast(:dt as text[]), cast(:m as text[]), cast(:c as text[])) as x(d, a, t, dt, m, c)
					on conflict on constraint transactions_no_duplicates do nothing""")
				.param("uid", uid).param("pm", revolut)
				.param("d", column(ps, "d")).param("a", column(ps, "a")).param("t", column(ps, "type"))
				.param("dt", column(ps, "date")).param("m", column(ps, "month")).param("c", column(ps, "cat"))
				.update();
			return new ImportResult(added, recs.size() - added);
		});
	}

	// ---------- validation ----------

	private static Rec validate(Rec in) {
		String type = checkType(in.type());
		String description = in.description() == null ? "" : in.description().trim();
		if (description.isEmpty() || description.length() > 200) throw bad("Add a description (up to 200 characters).");
		BigDecimal amount = in.amount();
		if (amount == null || amount.signum() <= 0 || amount.compareTo(new BigDecimal("1000000000")) >= 0 || amount.stripTrailingZeros().scale() > 2) {
			throw bad("Enter an amount above zero, with at most two decimals.");
		}
		LocalDate month = in.month() != null ? in.month().withDayOfMonth(1)
			: in.dateTime() != null ? in.dateTime().toLocalDate().withDayOfMonth(1) : null;
		if (month == null) throw bad("Give the record a date or at least a month.");
		String avoidable = in.avoidable() == null ? null : checkIn(in.avoidable(), AVOIDABLE, "avoidable");
		if (avoidable != null && type.equals("Income")) throw bad("Only expenses can be marked avoidable.");
		String recurrence = in.recurrence() == null ? null : checkIn(in.recurrence(), RECURRENCE, "recurrence");
		if (recurrence != null && type.equals("Income")) throw bad("Only expenses can be marked fixed, recurring or one-off.");
		String reason = in.reason() == null ? null : checkIn(in.reason(), REASONS, "reason");
		String notes = in.notes() == null || in.notes().isBlank() ? null : in.notes().trim();
		if (notes != null && notes.length() > 2000) throw bad("Notes can be up to 2,000 characters.");
		return new Rec(in.id(), description, amount, type, in.dateTime(), month, in.categoryId(), in.paymentMethodId(), avoidable, recurrence, reason, notes);
	}

	private static String checkType(String type) {
		if (!"Expense".equals(type) && !"Income".equals(type)) throw bad("Type must be Expense or Income.");
		return type;
	}

	private static String checkIn(String v, Set<String> allowed, String field) {
		if (!allowed.contains(v)) throw bad("Unknown " + field + " value.");
		return v;
	}

	/** Expense records take expense categories, income records income ones. Ownership is enforced by the FK + RLS. */
	private static void checkCategoryKind(JdbcClient s, Rec r) {
		if (r.categoryId() == null) return;
		String kind = s.sql("select kind from categories where id = :id").param("id", r.categoryId()).query(String.class).optional()
			.orElseThrow(() -> bad("That category doesn’t exist."));
		checkCategoryKind(Map.of(r.categoryId(), kind), r);
	}

	/** Same check against kinds already loaded (by id); a missing id is a category the user can't see. */
	private static void checkCategoryKind(Map<UUID, String> kinds, Rec r) {
		if (r.categoryId() == null) return;
		String kind = kinds.get(r.categoryId());
		if (kind == null) throw bad("That category doesn’t exist.");
		if (!kind.equals(r.type().equals("Income") ? "income" : "expense")) throw bad("That category is for " + kind + ", not this record.");
	}

	private static String[] column(List<Map<String, Object>> rows, String key) {
		return rows.stream().map(p -> p.get(key) == null ? null : p.get(key).toString()).toArray(String[]::new);
	}

	private static Map<String, Object> params(UUID uid, Rec r) {
		Map<String, Object> p = new HashMap<>();
		p.put("uid", uid);
		p.put("d", r.description());
		p.put("a", r.amount());
		p.put("type", r.type());
		p.put("date", r.dateTime() == null ? null : OffsetDateTime.of(r.dateTime(), ROME.getRules().getOffset(r.dateTime())).toString());
		p.put("month", r.month());
		p.put("cat", r.categoryId() == null ? null : r.categoryId().toString());
		p.put("pm", r.paymentMethodId() == null ? null : r.paymentMethodId().toString());
		p.put("av", r.avoidable());
		p.put("rec", r.recurrence());
		p.put("reason", r.reason());
		p.put("notes", r.notes());
		return p;
	}
}
