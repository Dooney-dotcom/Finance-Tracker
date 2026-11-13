package app.financetracker.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
class DashboardController {

	private static final ZoneId ROME = ZoneId.of("Europe/Rome");

	private final UserDb db;

	DashboardController(UserDb db) {
		this.db = db;
	}

	@GetMapping("/api/dashboard")
	Dashboard.Result dashboard(@AuthenticationPrincipal Jwt jwt,
			@RequestParam(defaultValue = "MONTH") Dashboard.Period period,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		// Identity comes only from the verified token; RLS enforces the same filter again.
		UUID user = UUID.fromString(jwt.getSubject());
		LocalDate anchor = date != null ? date : LocalDate.now(ROME);
		LocalDate today = LocalDate.now(ROME);
		LocalDate start = Dashboard.start(period, anchor), end = Dashboard.end(period, anchor);
		// The window the plan widgets look at: the period, plus up to a month overdue and the next 7 days.
		LocalDate from = start.isBefore(today.minusDays(31)) ? start : today.minusDays(31);
		LocalDate to = end.isAfter(today.plusDays(6)) ? end : today.plusDays(6);
		// Only loading happens while the connection is checked out; the computation runs after it is returned.
		Loaded in = db.run(jwt, sql -> {
			Map<UUID, Dashboard.Label> labels = new HashMap<>();
			sql.sql("select id, name, color from categories where user_id = ? union all select id, name, null from payment_methods where user_id = ?")
				.params(user, user)
				.query(rs -> { labels.put(rs.getObject(1, UUID.class), new Dashboard.Label(rs.getString(2), rs.getString(3))); });
			// ponytail: loads all of a user's rows per request; fine to tens of thousands, move aggregation into SQL past that.
			var rows = sql.sql("""
					select type = 'Income', amount, month, (date at time zone 'Europe/Rome')::date,
					       category_id, payment_method_id, avoidable::text, recurrence, description
					from transactions where user_id = ?""")
				.param(user)
				.query((rs, i) -> new Dashboard.Row(rs.getBoolean(1), rs.getBigDecimal(2),
					rs.getObject(3, LocalDate.class), rs.getObject(4, LocalDate.class),
					rs.getObject(5, UUID.class), rs.getObject(6, UUID.class), rs.getString(7), rs.getString(8), rs.getString(9)))
				.list();
			List<Plans.Plan> plans = PlansController.plans(sql, user, null, false);
			return plans.isEmpty() ? new Loaded(labels, rows, plans, Map.of(), List.of())
				: new Loaded(labels, rows, plans, PlansController.overrides(sql, user, from, to), PlansController.candidates(sql, user, from, to));
		});
		return Dashboard.compute(period, anchor, in.rows(), in.labels(), planned(in, start, end, today));
	}

	private record Loaded(Map<UUID, Dashboard.Label> labels, List<Dashboard.Row> rows, List<Plans.Plan> plans,
			Map<String, Plans.Override> overrides, List<Plans.Candidate> candidates) {}

	/** Unpaid bills in the period, the next 7 days (with up to a month of overdue ones), and what repeating bills cost per month. */
	private static Dashboard.Planned planned(Loaded in, LocalDate start, LocalDate end, LocalDate today) {
		List<Plans.Plan> plans = in.plans();
		if (plans.isEmpty()) return Dashboard.Planned.NONE;
		var overrides = in.overrides();
		var candidates = in.candidates();
		// A bill with a matching record is very likely paid already: its amount is in "spent", so it must not count again as still to come.
		var unpaid = Plans.expand(plans, overrides, candidates, start, end, today).stream()
			.filter(o -> open(o) && o.suggestion() == null).toList();
		var comingUp = Plans.expand(plans, overrides, candidates, today.minusDays(31), today.plusDays(6), today).stream().filter(DashboardController::open)
			.sorted(Comparator.comparing((Plans.Occurrence o) -> !o.status().equals("overdue")).thenComparing(Plans.Occurrence::due)).toList();
		return new Dashboard.Planned(unpaid.stream().map(Plans.Occurrence::amount).reduce(BigDecimal.ZERO, BigDecimal::add), unpaid, comingUp,
			Plans.monthlyCommitment(plans, today), Dashboard.averageMonthlyIncome(in.rows(), today));
	}

	private static boolean open(Plans.Occurrence o) {
		return o.status().equals("overdue") || o.status().equals("upcoming");
	}
}
