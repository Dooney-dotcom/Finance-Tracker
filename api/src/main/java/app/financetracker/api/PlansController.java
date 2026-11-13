package app.financetracker.api;

import static app.financetracker.api.RecordsController.ROME;
import static app.financetracker.api.RecordsController.bad;
import static app.financetracker.api.RecordsController.user;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import app.financetracker.api.Plans.Candidate;
import app.financetracker.api.Plans.Occurrence;
import app.financetracker.api.Plans.Override;
import app.financetracker.api.Plans.Plan;

/** Planned expenses: the rules, their occurrences, and linking an occurrence to the record that paid it. */
@RestController
@RequestMapping("/api/plans")
class PlansController {

	record OccurrenceIn(UUID transactionId, Boolean skipped, BigDecimal amount) {}

	private static final String PLAN_COLUMNS = "id, description, amount, category_id, payment_method_id, first_due, frequency, last_due";

	private final UserDb db;

	PlansController(UserDb db) {
		this.db = db;
	}

	@GetMapping
	List<Plan> list(@AuthenticationPrincipal Jwt jwt) {
		UUID uid = user(jwt);
		return db.run(jwt, s -> plans(s, uid, null, true));
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	Map<String, UUID> create(@AuthenticationPrincipal Jwt jwt, @RequestBody Plan in) {
		Plan p = validate(in);
		UUID uid = user(jwt);
		return linked(() -> db.run(jwt, s -> {
			checkCategory(s, p.categoryId());
			return Map.of("id", s.sql("""
					insert into plans (user_id, description, amount, category_id, payment_method_id, first_due, frequency, last_due, notes)
					values (:uid, :d, :a, :cat, :pm, :first, :freq, :last, :notes) returning id""")
				.params(params(uid, p)).query(UUID.class).single());
		}));
	}

	@PutMapping("/{id}")
	void update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestBody Plan in) {
		Plan p = validate(in);
		UUID uid = user(jwt);
		int n = linked(() -> db.run(jwt, s -> {
			checkCategory(s, p.categoryId());
			Map<String, Object> params = params(uid, p);
			params.put("id", id);
			return s.sql("""
					update plans set description = :d, amount = :a, category_id = :cat, payment_method_id = :pm,
					  first_due = :first, frequency = :freq, last_due = :last, notes = :notes
					where id = :id and user_id = :uid""").params(params).update();
		}));
		if (n == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
	}

	/** Records it already paid stay; only the plan and its occurrence notes go. */
	@DeleteMapping("/{id}")
	ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
		UUID uid = user(jwt);
		int n = db.run(jwt, s -> s.sql("delete from plans where id = :id and user_id = :uid").param("id", id).param("uid", uid).update());
		if (n == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
		return ResponseEntity.noContent().build();
	}

	@GetMapping("/occurrences")
	List<Occurrence> occurrences(@AuthenticationPrincipal Jwt jwt,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
		if (to.isBefore(from) || ChronoUnit.DAYS.between(from, to) > 400) throw bad("Pick a range of up to a year.");
		UUID uid = user(jwt);
		record Loaded(List<Plan> plans, Map<String, Override> overrides, List<Candidate> candidates) {}
		Loaded in = db.run(jwt, s -> new Loaded(plans(s, uid, null, false), overrides(s, uid, from, to), candidates(s, uid, from, to)));
		// Matching runs after the connection is back in the pool.
		return Plans.expand(in.plans(), in.overrides(), in.candidates(), from, to, LocalDate.now(ROME));
	}

	/** Link a record (confirming a match), skip, or change the amount for one occurrence. */
	@PutMapping("/{id}/occurrences/{due}")
	void setOccurrence(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
			@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate due, @RequestBody OccurrenceIn in) {
		if (in.amount() != null && !validAmount(in.amount())) throw bad("Enter an amount of zero or more, in euros and cents.");
		UUID uid = user(jwt);
		linked(() -> db.run(jwt, s -> {
			occurrenceOf(s, uid, id, due);
			if (in.transactionId() != null) {
				s.sql("select 1 from transactions where id = :t and user_id = :uid and type = 'Expense'").param("t", in.transactionId()).param("uid", uid)
					.query(Integer.class).optional().orElseThrow(() -> bad("That record doesn’t exist or isn’t an expense."));
			}
			return upsert(s, uid, id, due, in.transactionId(), Boolean.TRUE.equals(in.skipped()), in.amount());
		}));
	}

	@DeleteMapping("/{id}/occurrences/{due}")
	ResponseEntity<Void> resetOccurrence(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
			@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate due) {
		UUID uid = user(jwt);
		db.run(jwt, s -> s.sql("delete from plan_occurrences where plan_id = :id and due = :due and user_id = :uid")
			.param("id", id).param("due", due).param("uid", uid).update());
		return ResponseEntity.noContent().build();
	}

	/** Records the expense from the plan's details, dated on the due day, and links it. One transaction: both or neither. */
	@PostMapping("/{id}/occurrences/{due}/pay")
	@ResponseStatus(HttpStatus.CREATED)
	Map<String, UUID> pay(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
			@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate due) {
		UUID uid = user(jwt);
		return linked(() -> db.run(jwt, s -> {
			Plan p = occurrenceOf(s, uid, id, due);
			BigDecimal override = s.sql("select amount from plan_occurrences where plan_id = :id and due = :due and transaction_id is null")
				.param("id", id).param("due", due).query(BigDecimal.class).optional().orElse(null);
			if (s.sql("select count(*) from plan_occurrences where plan_id = :id and due = :due and transaction_id is not null")
					.param("id", id).param("due", due).query(Integer.class).single() > 0)
				throw new ResponseStatusException(HttpStatus.CONFLICT, "This one is already paid.");
			LocalDateTime at = due.atTime(12, 0);
			UUID tx = s.sql("""
					insert into transactions (user_id, description, amount, type, date, month, category_id, payment_method_id, recurrence)
					values (:uid, :d, :a, 'Expense', cast(:date as timestamptz), :month, :cat, :pm, :rec) returning id""")
				.param("uid", uid).param("d", p.description()).param("a", override != null ? override : p.amount())
				.param("date", OffsetDateTime.of(at, ROME.getRules().getOffset(at)).toString()).param("month", due.withDayOfMonth(1))
				.param("cat", p.categoryId()).param("pm", p.paymentMethodId())
				.param("rec", p.frequency().equals("Once") ? "One-off" : "Fixed")
				.query(UUID.class).single();
			upsert(s, uid, id, due, tx, false, override);
			return Map.of("id", tx);
		}));
	}

	// ---------- helpers ----------

	/** Notes are only read back by the plans list; occurrences and the dashboard never return them. */
	static List<Plan> plans(JdbcClient s, UUID uid, UUID id, boolean withNotes) {
		return s.sql("select " + PLAN_COLUMNS + (withNotes ? ", notes" : ", null") + " from plans where user_id = :uid" + (id == null ? "" : " and id = :id") + " order by lower(description)")
			.param("uid", uid).params(id == null ? Map.of() : Map.of("id", id))
			.query((rs, i) -> new Plan(rs.getObject(1, UUID.class), rs.getString(2), rs.getBigDecimal(3), rs.getObject(4, UUID.class),
				rs.getObject(5, UUID.class), rs.getObject(6, LocalDate.class), rs.getString(7), rs.getObject(8, LocalDate.class), rs.getString(9)))
			.list();
	}

	/** Dated expenses around [from, to] not yet linked to any plan: what an unpaid occurrence might be matched to. */
	static List<Candidate> candidates(JdbcClient s, UUID uid, LocalDate from, LocalDate to) {
		return s.sql("""
				select t.id, t.description, (t.date at time zone 'Europe/Rome')::date, t.amount, t.payment_method_id
				from transactions t
				where t.user_id = :uid and t.type = 'Expense' and t.date is not null
				  and (t.date at time zone 'Europe/Rome')::date between :f and :t
				  and not exists (select 1 from plan_occurrences o where o.transaction_id = t.id)""")
			.param("uid", uid).param("f", from.minusDays(Plans.MATCH_DAYS)).param("t", to.plusDays(Plans.MATCH_DAYS))
			.query((rs, i) -> new Candidate(rs.getObject(1, UUID.class), rs.getString(2), rs.getObject(3, LocalDate.class),
				rs.getBigDecimal(4), rs.getObject(5, UUID.class))).list();
	}

	static Map<String, Override> overrides(JdbcClient s, UUID uid, LocalDate from, LocalDate to) {
		Map<String, Override> out = new HashMap<>();
		s.sql("select plan_id, due, transaction_id, skipped, amount from plan_occurrences where user_id = :uid and due between :f and :t")
			.param("uid", uid).param("f", from).param("t", to)
			.query(rs -> {
				out.put(Plans.key(rs.getObject(1, UUID.class), rs.getObject(2, LocalDate.class)),
					new Override(rs.getObject(3, UUID.class), rs.getBoolean(4), rs.getBigDecimal(5)));
			});
		return out;
	}

	/** The plan, provided `due` is one of its dates. */
	private static Plan occurrenceOf(JdbcClient s, UUID uid, UUID id, LocalDate due) {
		Plan p = plans(s, uid, id, false).stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
		if (!Plans.fallsOn(p, due)) throw bad("That plan isn’t due on that day.");
		return p;
	}

	private static int upsert(JdbcClient s, UUID uid, UUID id, LocalDate due, UUID tx, boolean skipped, BigDecimal amount) {
		return s.sql("""
				insert into plan_occurrences (plan_id, due, user_id, transaction_id, skipped, amount) values (:id, :due, :uid, :tx, :sk, :a)
				on conflict (plan_id, due) do update set transaction_id = excluded.transaction_id, skipped = excluded.skipped, amount = excluded.amount""")
			.param("id", id).param("due", due).param("uid", uid).param("tx", tx).param("sk", skipped).param("a", amount).update();
	}

	private static void checkCategory(JdbcClient s, UUID categoryId) {
		if (categoryId == null) return;
		String kind = s.sql("select kind from categories where id = :id").param("id", categoryId).query(String.class).optional()
			.orElseThrow(() -> bad("That category doesn’t exist."));
		if (!kind.equals("expense")) throw bad("Pick an expense category.");
	}

	/** Fits plans.amount / plan_occurrences.amount, numeric(12,2) with amount >= 0. */
	static boolean validAmount(BigDecimal a) {
		return a.signum() >= 0 && a.compareTo(MAX_AMOUNT) < 0 && a.stripTrailingZeros().scale() <= 2;
	}

	private static final BigDecimal MAX_AMOUNT = new BigDecimal("10000000000");

	static Plan validate(Plan in) {
		String d = in.description() == null ? "" : in.description().trim();
		if (d.isEmpty() || d.length() > 200) throw bad("Describe it (up to 200 characters).");
		if (in.amount() == null || !validAmount(in.amount())) throw bad("Enter an amount of zero or more, in euros and cents.");
		if (in.firstDue() == null) throw bad("Pick the date it’s due.");
		if (in.frequency() == null || !Plans.STEP.containsKey(in.frequency())) throw bad("Say how often it repeats.");
		LocalDate last = in.frequency().equals("Once") ? null : in.lastDue();
		if (last != null && last.isBefore(in.firstDue())) throw bad("It can’t end before it starts.");
		String notes = in.notes() == null || in.notes().isBlank() ? null : in.notes().trim();
		if (notes != null && notes.length() > 2000) throw bad("Notes can be up to 2,000 characters.");
		return new Plan(null, d, in.amount(), in.categoryId(), in.paymentMethodId(), in.firstDue(), in.frequency(), last, notes);
	}

	private static Map<String, Object> params(UUID uid, Plan p) {
		Map<String, Object> m = new HashMap<>();
		m.put("uid", uid);
		m.put("d", p.description());
		m.put("a", p.amount());
		m.put("cat", p.categoryId());
		m.put("pm", p.paymentMethodId());
		m.put("first", p.firstDue());
		m.put("freq", p.frequency());
		m.put("last", p.lastDue());
		m.put("notes", p.notes());
		return m;
	}

	private static <T> T linked(java.util.function.Supplier<T> work) {
		try {
			return work.get();
		} catch (DuplicateKeyException e) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "That record is already linked to another plan, or an identical record exists.");
		} catch (DataIntegrityViolationException e) {
			throw bad("That category or payment method doesn’t exist.");
		}
	}
}
