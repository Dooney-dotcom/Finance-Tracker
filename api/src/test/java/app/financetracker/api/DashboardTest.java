package app.financetracker.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import app.financetracker.api.Dashboard.Period;
import app.financetracker.api.Dashboard.Row;

class DashboardTest {

	static final UUID GROCERIES = UUID.randomUUID();

	static Row expense(String amount, String day, String month, UUID category) {
		return new Row(false, new BigDecimal(amount), LocalDate.parse(month), day == null ? null : LocalDate.parse(day),
			category, null, null, null, "x");
	}

	static Row income(String amount, String day) {
		LocalDate d = LocalDate.parse(day);
		return new Row(true, new BigDecimal(amount), d.withDayOfMonth(1), d, null, null, null, null, "salary");
	}

	final List<Row> rows = List.of(
		expense("10.00", "2026-09-05", "2026-09-01", GROCERIES),
		expense("20.00", "2026-09-20", "2026-09-01", null),
		income("1257.00", "2026-10-01"),
		expense("500.00", "2026-10-01", "2026-10-01", null),
		expense("30.00", "2026-10-15", "2026-10-01", GROCERIES),
		// Bill paid 25 Oct but assigned to September by the user.
		expense("33.90", "2026-10-25", "2026-09-01", null),
		// Zero-amount padding so September spans 7 days and counts as a real, dated month.
		expense("0.00", "2026-09-21", "2026-09-01", null), expense("0.00", "2026-09-22", "2026-09-01", null),
		expense("0.00", "2026-09-23", "2026-09-01", null), expense("0.00", "2026-09-24", "2026-09-01", null));

	@Test
	void monthFollowsAssignedMonthNotDate() {
		var r = Dashboard.compute(Period.MONTH, LocalDate.parse("2026-10-10"), rows, Map.of(GROCERIES, new Dashboard.Label("Groceries", "#eb6834")));
		assertThat(r.totals().expense()).isEqualByComparingTo("530.00");
		assertThat(r.totals().net()).isEqualByComparingTo("727.00");
		assertThat(r.netYearToDate()).isEqualByComparingTo("663.10");
		assertThat(r.categories().get(0).id()).isNull(); // Uncategorised 500 leads
		assertThat(r.categories().get(1).name()).isEqualTo("Groceries");
		assertThat(r.categories().get(1).color()).isEqualTo("#eb6834");
		assertThat(r.categories().get(0).color()).isNull();
		assertThat(r.incomeCategories()).singleElement().satisfies(s -> assertThat(s.amount()).isEqualByComparingTo("1257.00"));
		assertThat(r.trend()).hasSize(31);
		assertThat(r.trend().get(30).cumulativeExpense()).isEqualByComparingTo("530.00");
		// Pace = September's running total; the late bill lands on day 25 of September.
		assertThat(r.trend().get(4).averagePace()).isEqualByComparingTo("10.00");
		assertThat(r.trend().get(30).averagePace()).isEqualByComparingTo("63.90");
	}

	@Test
	void weekUsesRealDatesAndStartsMonday() {
		var r = Dashboard.compute(Period.WEEK, LocalDate.parse("2026-10-29"), rows, Map.of());
		assertThat(r.start()).isEqualTo("2026-10-26");
		assertThat(r.end()).isEqualTo("2026-11-01");
		assertThat(r.totals().records()).isZero(); // the 25 Oct bill falls in the previous week
		assertThat(r.trend()).hasSize(7);
	}

	@Test
	void undatedRowsAreCountedNotDropped() {
		var withUndated = new java.util.ArrayList<>(rows);
		withUndated.add(expense("5.00", null, "2026-10-01", null));
		assertThat(Dashboard.compute(Period.DAY, LocalDate.parse("2026-10-15"), withUndated, Map.of()).undated()).isEqualTo(1);
		assertThat(Dashboard.compute(Period.MONTH, LocalDate.parse("2026-10-15"), withUndated, Map.of()).totals().expense())
			.isEqualByComparingTo("535.00");
		// A month with an undated record is left out of the average-month pace.
		withUndated.add(expense("999.00", null, "2026-09-01", null));
		var r = Dashboard.compute(Period.MONTH, LocalDate.parse("2026-10-15"), withUndated, Map.of());
		assertThat(r.trend().get(0).averagePace()).isNull();
	}

	@Test
	void singleDayMonthsAreLeftOutOfPace() {
		var withPlaceholder = new java.util.ArrayList<>(rows);
		withPlaceholder.add(expense("400.00", "2026-08-01", "2026-08-01", null));
		withPlaceholder.add(expense("600.00", "2026-08-01", "2026-08-01", null));
		withPlaceholder.add(expense("50.00", "2026-08-14", "2026-08-01", null));
		var r = Dashboard.compute(Period.MONTH, LocalDate.parse("2026-10-15"), withPlaceholder, Map.of());
		// Only September counts: August's expenses sit on just two days.
		assertThat(r.trend().get(30).averagePace()).isEqualByComparingTo("63.90");
	}

	@Test
	void avoidableSplitsTaggedFromUntagged() {
		var tagged = new Row(false, new BigDecimal("12.00"), LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-03"),
			null, null, "Partly", "Fixed", "x");
		var r = Dashboard.compute(Period.MONTH, LocalDate.parse("2026-10-03"), List.of(tagged, rows.get(4)), Map.of());
		assertThat(r.avoidable().partly()).isEqualByComparingTo("12.00");
		assertThat(r.avoidable().untagged()).isEqualByComparingTo("30.00");
		assertThat(r.avoidable().tagged()).isEqualTo(1);
		assertThat(r.recurrence().fixed()).isEqualByComparingTo("12.00");
		assertThat(r.recurrence().untagged()).isEqualByComparingTo("30.00");
		assertThat(r.recurrence().tagged()).isEqualTo(1);
	}

	@Test
	void averageIncomeCountsOnlyMonthsWithRecordsBeforeTheAnchorMonth() {
		// September has only expenses, October has 1257 income; November (anchor month) is excluded.
		var withNov = new java.util.ArrayList<>(rows);
		withNov.add(income("9999.00", "2026-11-02"));
		assertThat(Dashboard.averageMonthlyIncome(withNov, LocalDate.parse("2026-11-04"))).isEqualByComparingTo("628.50");
		assertThat(Dashboard.averageMonthlyIncome(List.of(), LocalDate.parse("2026-11-04"))).isNull();
	}
}
