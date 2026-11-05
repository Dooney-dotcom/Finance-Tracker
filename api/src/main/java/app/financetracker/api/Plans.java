package app.financetracker.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Pure logic for planned expenses: which dates a rule falls on, and which real record probably paid each one. */
final class Plans {

	private Plans() {}

	static final Map<String, Integer> STEP = Map.of("Once", 0, "Monthly", 1, "Quarterly", 3, "Annual", 12);
	static final int MATCH_DAYS = 5;
	static final BigDecimal MATCH_SHARE = new BigDecimal("0.10");

	record Plan(UUID id, String description, BigDecimal amount, UUID categoryId, UUID paymentMethodId,
			LocalDate firstDue, String frequency, LocalDate lastDue, String notes) {}

	/** What differs from the rule for one occurrence. */
	record Override(UUID transactionId, boolean skipped, BigDecimal amount) {}

	/** An expense not yet linked to any plan. */
	record Candidate(UUID id, String description, LocalDate day, BigDecimal amount, UUID paymentMethodId) {}

	record Occurrence(UUID planId, LocalDate due, String description, BigDecimal amount, UUID categoryId, UUID paymentMethodId,
			String frequency, String status, UUID transactionId, Candidate suggestion) {}

	/** The rule's due dates within [from, to]. Each is counted from firstDue, so the 31st becomes the 30th or 28th without drifting. */
	static List<LocalDate> dates(Plan p, LocalDate from, LocalDate to) {
		int step = STEP.get(p.frequency());
		LocalDate end = p.lastDue() != null && p.lastDue().isBefore(to) ? p.lastDue() : to;
		List<LocalDate> out = new ArrayList<>();
		if (step == 0) {
			if (!p.firstDue().isBefore(from) && !p.firstDue().isAfter(end)) out.add(p.firstDue());
			return out;
		}
		long n = Math.max(0, ChronoUnit.MONTHS.between(p.firstDue(), from) / step - 1);
		for (;; n++) {
			LocalDate d = p.firstDue().plusMonths(n * step);
			if (d.isAfter(end)) return out;
			if (!d.isBefore(from)) out.add(d);
		}
	}

	static boolean fallsOn(Plan p, LocalDate day) {
		return !dates(p, day, day).isEmpty();
	}

	/** Occurrences in date order, with status, and a suggested matching record for the unpaid ones. */
	static List<Occurrence> expand(List<Plan> plans, Map<String, Override> overrides, List<Candidate> candidates,
			LocalDate from, LocalDate to, LocalDate today) {
		record Raw(Plan plan, LocalDate due, Override o) {}
		List<Raw> raw = new ArrayList<>();
		for (Plan p : plans)
			for (LocalDate d : dates(p, from, to)) raw.add(new Raw(p, d, overrides.get(key(p.id(), d))));
		raw.sort(Comparator.comparing(Raw::due).thenComparing(r -> r.plan().description()));

		Set<UUID> taken = new HashSet<>();
		List<Occurrence> out = new ArrayList<>();
		for (Raw r : raw) {
			Override o = r.o();
			BigDecimal amount = o != null && o.amount() != null ? o.amount() : r.plan().amount();
			String status = o != null && o.transactionId() != null ? "paid"
				: o != null && o.skipped() ? "skipped"
				: r.due().isBefore(today) ? "overdue" : "upcoming";
			Candidate match = status.equals("overdue") || status.equals("upcoming")
				? best(r.plan(), r.due(), amount, candidates, taken) : null;
			if (match != null) taken.add(match.id());
			out.add(new Occurrence(r.plan().id(), r.due(), r.plan().description(), amount, r.plan().categoryId(),
				r.plan().paymentMethodId(), r.plan().frequency(), status, o == null ? null : o.transactionId(), match));
		}
		return out;
	}

	/** Same payment method (when the plan names one), within MATCH_DAYS of the due date and MATCH_SHARE of the amount; closest date wins. */
	static Candidate best(Plan p, LocalDate due, BigDecimal amount, List<Candidate> candidates, Set<UUID> taken) {
		BigDecimal tolerance = amount.multiply(MATCH_SHARE);
		return candidates.stream()
			.filter(c -> !taken.contains(c.id()))
			.filter(c -> p.paymentMethodId() == null || p.paymentMethodId().equals(c.paymentMethodId()))
			.filter(c -> Math.abs(ChronoUnit.DAYS.between(due, c.day())) <= MATCH_DAYS)
			.filter(c -> c.amount().subtract(amount).abs().compareTo(tolerance) <= 0)
			.min(Comparator.<Candidate>comparingLong(c -> Math.abs(ChronoUnit.DAYS.between(due, c.day())))
				.thenComparing(c -> c.amount().subtract(amount).abs()))
			.orElse(null);
	}

	/** What the still-active repeating plans cost per month: quarterly ÷ 3, annual ÷ 12. One-off plans are not commitments. */
	static BigDecimal monthlyCommitment(List<Plan> plans, LocalDate today) {
		return plans.stream()
			.filter(p -> STEP.get(p.frequency()) > 0 && (p.lastDue() == null || !p.lastDue().isBefore(today)))
			.map(p -> p.amount().divide(BigDecimal.valueOf(STEP.get(p.frequency())), 2, java.math.RoundingMode.HALF_UP))
			.reduce(BigDecimal.ZERO, BigDecimal::add);
	}

	static String key(UUID planId, LocalDate due) {
		return planId + "|" + due;
	}
}
