package app.financetracker.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import app.financetracker.api.Plans.Candidate;
import app.financetracker.api.Plans.Override;
import app.financetracker.api.Plans.Plan;

class PlansTest {

	static final UUID ISYBANK = UUID.randomUUID(), PAYPAL = UUID.randomUUID();

	static Plan plan(String freq, String first, String last, String amount, UUID pm) {
		return new Plan(UUID.randomUUID(), "Rent", new BigDecimal(amount), null, pm, LocalDate.parse(first), freq,
			last == null ? null : LocalDate.parse(last), null);
	}

	static LocalDate d(String s) {
		return LocalDate.parse(s);
	}

	@Test
	void monthlyOn31stClampsWithoutDrifting() {
		var p = plan("Monthly", "2026-01-31", null, "10", null);
		assertThat(Plans.dates(p, d("2026-01-01"), d("2026-04-30")))
			.containsExactly(d("2026-01-31"), d("2026-02-28"), d("2026-03-31"), d("2026-04-30"));
		// Far from the start, still on the 31st when the month has one.
		assertThat(Plans.dates(p, d("2027-07-01"), d("2027-08-31"))).containsExactly(d("2027-07-31"), d("2027-08-31"));
	}

	@Test
	void quarterlyAnnualOnceAndEnd() {
		assertThat(Plans.dates(plan("Quarterly", "2026-11-15", null, "1", null), d("2026-11-01"), d("2027-06-30")))
			.containsExactly(d("2026-11-15"), d("2027-02-15"), d("2027-05-15"));
		assertThat(Plans.dates(plan("Annual", "2025-03-10", null, "1", null), d("2026-01-01"), d("2026-12-31"))).containsExactly(d("2026-03-10"));
		assertThat(Plans.dates(plan("Once", "2026-11-07", null, "1", null), d("2026-11-01"), d("2026-11-30"))).containsExactly(d("2026-11-07"));
		assertThat(Plans.dates(plan("Once", "2026-11-07", null, "1", null), d("2026-12-01"), d("2026-12-31"))).isEmpty();
		assertThat(Plans.dates(plan("Monthly", "2026-11-01", "2026-12-01", "1", null), d("2026-11-01"), d("2027-02-28")))
			.containsExactly(d("2026-11-01"), d("2026-12-01"));
		assertThat(Plans.fallsOn(plan("Monthly", "2026-11-01", null, "1", null), d("2026-12-02"))).isFalse();
	}

	@Test
	void statusesOverridesAndMatching() {
		var rent = plan("Monthly", "2026-11-01", null, "500.00", ISYBANK);
		var tv = new Plan(UUID.randomUUID(), "Now TV", new BigDecimal("4.99"), null, PAYPAL, d("2026-11-12"), "Monthly", null, null);
		var paidTx = UUID.randomUUID();
		var overrides = Map.of(
			Plans.key(rent.id(), d("2026-11-01")), new Override(paidTx, false, null),
			Plans.key(tv.id(), d("2026-12-12")), new Override(null, false, new BigDecimal("6.99")));
		var good = new Candidate(UUID.randomUUID(), "NOW TV", d("2026-11-13"), new BigDecimal("4.99"), PAYPAL);
		var candidates = List.of(
			new Candidate(UUID.randomUUID(), "Wrong method", d("2026-11-12"), new BigDecimal("4.99"), ISYBANK),
			new Candidate(UUID.randomUUID(), "Too far", d("2026-11-20"), new BigDecimal("4.99"), PAYPAL),
			new Candidate(UUID.randomUUID(), "Too different", d("2026-11-12"), new BigDecimal("6.00"), PAYPAL),
			good);

		var out = Plans.expand(List.of(rent, tv), overrides, candidates, d("2026-11-01"), d("2026-12-31"), d("2026-11-20"));

		assertThat(out).extracting(o -> o.description() + " " + o.due() + " " + o.status()).containsExactly(
			"Rent 2026-11-01 paid", "Now TV 2026-11-12 overdue", "Rent 2026-12-01 upcoming", "Now TV 2026-12-12 upcoming");
		assertThat(out.get(0).suggestion()).isNull(); // paid occurrences get no suggestion
		assertThat(out.get(1).suggestion()).isEqualTo(good);
		assertThat(out.get(3).amount()).isEqualByComparingTo("6.99");
		assertThat(out.get(3).suggestion()).isNull(); // the one good candidate is already taken
	}

	@Test
	void monthlyCommitmentSpreadsQuarterlyAndAnnualAndSkipsEndedAndOnce() {
		var plans = List.of(
			plan("Monthly", "2026-01-01", null, "500.00", null),
			plan("Quarterly", "2026-01-01", null, "90.00", null),
			plan("Annual", "2026-01-01", null, "120.00", null),
			plan("Monthly", "2026-01-01", "2026-10-01", "50.00", null), // ended
			plan("Once", "2026-12-01", null, "999.00", null));
		assertThat(Plans.monthlyCommitment(plans, d("2026-11-04"))).isEqualByComparingTo("540.00");
	}

	@Test
	void amountsMustFitTheColumn() {
		for (String ok : List.of("0", "4.99", "9999999999.99", "1.500")) assertThat(PlansController.validAmount(new BigDecimal(ok))).as(ok).isTrue();
		for (String bad : List.of("-1", "0.001", "10000000000", "1e400")) assertThat(PlansController.validAmount(new BigDecimal(bad))).as(bad).isFalse();
	}
}
