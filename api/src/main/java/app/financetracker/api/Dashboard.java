package app.financetracker.api;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;

/** Pure dashboard aggregation: one user's rows in, everything the Dashboard tab shows out. */
public final class Dashboard {

	private Dashboard() {}

	public enum Period { DAY, WEEK, MONTH, YEAR }

	/** One transaction. `day` is the Europe/Rome calendar date (null if undated); `month` is the user's own assignment. */
	public record Row(boolean income, BigDecimal amount, LocalDate month, LocalDate day,
			UUID categoryId, UUID paymentMethodId, String avoidable, String recurrence, String description) {}

	public record Totals(BigDecimal income, BigDecimal expense, BigDecimal net, int records) {}

	/** One trend step. Cumulative and pace are only set for the MONTH view. */
	public record Point(String key, BigDecimal income, BigDecimal expense,
			BigDecimal cumulativeExpense, BigDecimal averagePace) {}

	/** A breakdown entry; id and name are null for "Uncategorised" / no payment method. Color is the category's own (#rrggbb), else null. */
	public record Slice(UUID id, String name, String color, BigDecimal amount, int records) {}

	/** A category or payment method's display data. */
	public record Label(String name, String color) {}

	public record Avoidable(BigDecimal yes, BigDecimal partly, BigDecimal no, BigDecimal untagged,
			int tagged, int expenses) {}

	public record Recurrence(BigDecimal fixed, BigDecimal recurring, BigDecimal oneOff, BigDecimal untagged,
			int tagged, int expenses) {}

	public record DayRecord(String description, boolean income, BigDecimal amount, UUID categoryId) {}

	public record Result(Period period, LocalDate start, LocalDate end, Totals totals,
			BigDecimal netYearToDate, List<Point> trend, BigDecimal averageDailyExpense,
			List<DayRecord> dayRecords, List<Slice> categories, List<Slice> incomeCategories, List<Slice> paymentMethods,
			Avoidable avoidable, Recurrence recurrence, int undated, Planned planned) {}

	/** Forward-looking figures from planned expenses. Never part of the totals: a plan is a promise, not spending. */
	public record Planned(BigDecimal stillToPay, List<Plans.Occurrence> unpaid, List<Plans.Occurrence> comingUp,
			BigDecimal monthlyCommitment, BigDecimal averageIncome) {
		static final Planned NONE = new Planned(BigDecimal.ZERO, List.of(), List.of(), BigDecimal.ZERO, null);
	}

	public static Result compute(Period period, LocalDate anchor, List<Row> rows, Map<UUID, Label> labels) {
		return compute(period, anchor, rows, labels, Planned.NONE);
	}

	/** Income per month over the 12 months before the anchor's month, counting only months that have any record. Null without history. */
	static BigDecimal averageMonthlyIncome(List<Row> rows, LocalDate anchor) {
		LocalDate to = anchor.withDayOfMonth(1), from = to.minusMonths(12);
		List<Row> window = rows.stream().filter(r -> !r.month().isBefore(from) && r.month().isBefore(to)).toList();
		long months = window.stream().map(Row::month).distinct().count();
		if (months == 0) return null;
		return sum(window.stream().filter(Row::income).toList()).divide(BigDecimal.valueOf(months), 2, RoundingMode.HALF_UP);
	}

	static LocalDate start(Period period, LocalDate anchor) {
		return switch (period) {
			case DAY -> anchor;
			case WEEK -> anchor.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
			case MONTH -> anchor.withDayOfMonth(1);
			case YEAR -> anchor.withDayOfYear(1);
		};
	}

	static LocalDate end(Period period, LocalDate anchor) {
		return switch (period) {
			case DAY -> anchor;
			case WEEK -> start(period, anchor).plusDays(6);
			case MONTH -> anchor.with(TemporalAdjusters.lastDayOfMonth());
			case YEAR -> anchor.with(TemporalAdjusters.lastDayOfYear());
		};
	}

	public static Result compute(Period period, LocalDate anchor, List<Row> rows, Map<UUID, Label> labels, Planned planned) {
		LocalDate start = start(period, anchor), end = end(period, anchor);
		// Month and year follow the user's `month` assignment; day and week need a real date.
		boolean byMonth = period == Period.MONTH || period == Period.YEAR;
		List<Row> in = rows.stream()
			.filter(r -> byMonth ? within(r.month(), start, end) : r.day() != null && within(r.day(), start, end))
			.toList();
		List<Row> expenses = in.stream().filter(r -> !r.income()).toList();

		BigDecimal income = sum(in.stream().filter(Row::income).toList());
		BigDecimal expense = sum(expenses);
		LocalDate anchorMonth = anchor.withDayOfMonth(1);
		BigDecimal ytd = net(rows.stream()
			.filter(r -> r.month().getYear() == anchor.getYear() && !r.month().isAfter(anchorMonth)).toList());
		int undated = byMonth ? 0
			: (int) rows.stream().filter(r -> r.day() == null && r.month().equals(anchorMonth)).count();

		List<Point> trend = switch (period) {
			case YEAR -> yearTrend(anchor.getYear(), rows);
			case MONTH -> monthTrend(start, in, rows);
			case WEEK -> weekTrend(start, in);
			case DAY -> List.of();
		};
		BigDecimal avgDaily = period == Period.DAY ? averageDailyExpense(anchor, rows) : null;
		List<DayRecord> dayRecords = period == Period.DAY
			? in.stream().map(r -> new DayRecord(r.description(), r.income(), r.amount(), r.categoryId())).toList()
			: List.of();

		return new Result(period, start, end,
			new Totals(income, expense, income.subtract(expense), in.size()), ytd,
			trend, avgDaily, dayRecords,
			slices(expenses, Row::categoryId, labels), slices(in.stream().filter(Row::income).toList(), Row::categoryId, labels),
			slices(expenses, Row::paymentMethodId, labels),
			avoidable(expenses), recurrence(expenses), undated, planned);
	}

	private static List<Point> yearTrend(int year, List<Row> rows) {
		List<Point> points = new ArrayList<>();
		for (int m = 1; m <= 12; m++) {
			LocalDate month = LocalDate.of(year, m, 1);
			List<Row> rs = rows.stream().filter(r -> r.month().equals(month)).toList();
			points.add(new Point(month.toString().substring(0, 7),
				sum(rs.stream().filter(Row::income).toList()), sum(rs.stream().filter(r -> !r.income()).toList()), null, null));
		}
		return points;
	}

	/** Daily spend for the month, its running total, and the average running total of every earlier month. */
	private static List<Point> monthTrend(LocalDate start, List<Row> in, List<Row> rows) {
		int len = start.lengthOfMonth();
		BigDecimal[] inc = zeros(len), exp = zeros(len);
		for (Row r : in) {
			int d = dayIndex(r, len);
			if (r.income()) inc[d] = inc[d].add(r.amount()); else exp[d] = exp[d].add(r.amount());
		}

		// Only months where every record has a real date can say how spending builds up day by day.
		// Nor can a month whose expenses sit on a handful of days (placeholder dates from the Notion import).
		// ponytail: fixed 7-day threshold; real months here use 23-30 days. Drop once Jan-May get real dates.
		java.util.Set<LocalDate> undatedMonths = new java.util.HashSet<>();
		Map<LocalDate, java.util.Set<LocalDate>> expenseDays = new HashMap<>();
		for (Row r : rows) {
			if (r.day() == null) undatedMonths.add(r.month());
			else if (!r.income()) expenseDays.computeIfAbsent(r.month(), m -> new java.util.HashSet<>()).add(r.day());
		}
		expenseDays.forEach((m, days) -> { if (days.size() < 7) undatedMonths.add(m); });
		Map<LocalDate, BigDecimal[]> earlier = new HashMap<>();
		for (Row r : rows) {
			if (r.income() || !r.month().isBefore(start) || undatedMonths.contains(r.month())) continue;
			int mlen = r.month().lengthOfMonth();
			BigDecimal[] days = earlier.computeIfAbsent(r.month(), m -> zeros(mlen));
			int d = dayIndex(r, mlen);
			days[d] = days[d].add(r.amount());
		}
		List<BigDecimal[]> earlierCumulative = earlier.values().stream().map(Dashboard::cumulative).toList();

		BigDecimal[] cum = cumulative(exp);
		List<Point> points = new ArrayList<>();
		for (int i = 0; i < len; i++) {
			BigDecimal pace = null;
			if (!earlierCumulative.isEmpty()) {
				BigDecimal total = BigDecimal.ZERO;
				for (BigDecimal[] c : earlierCumulative) total = total.add(c[Math.min(i, c.length - 1)]);
				pace = total.divide(BigDecimal.valueOf(earlierCumulative.size()), 2, RoundingMode.HALF_UP);
			}
			points.add(new Point(String.valueOf(i + 1), inc[i], exp[i], cum[i], pace));
		}
		return points;
	}

	private static List<Point> weekTrend(LocalDate start, List<Row> in) {
		List<Point> points = new ArrayList<>();
		for (int i = 0; i < 7; i++) {
			LocalDate day = start.plusDays(i);
			List<Row> rs = in.stream().filter(r -> day.equals(r.day())).toList();
			points.add(new Point(day.toString(),
				sum(rs.stream().filter(Row::income).toList()), sum(rs.stream().filter(r -> !r.income()).toList()), null, null));
		}
		return points;
	}

	/** Average spend per calendar day, from the first dated record up to the day before `anchor`. */
	private static BigDecimal averageDailyExpense(LocalDate anchor, List<Row> rows) {
		List<Row> before = rows.stream().filter(r -> !r.income() && r.day() != null && r.day().isBefore(anchor)).toList();
		if (before.isEmpty()) return null;
		LocalDate first = before.stream().map(Row::day).min(Comparator.naturalOrder()).orElseThrow();
		long days = ChronoUnit.DAYS.between(first, anchor);
		return sum(before).divide(BigDecimal.valueOf(days), 2, RoundingMode.HALF_UP);
	}

	private static List<Slice> slices(List<Row> expenses, Function<Row, UUID> key, Map<UUID, Label> labels) {
		Map<UUID, BigDecimal> amounts = new HashMap<>();
		Map<UUID, Integer> counts = new HashMap<>();
		for (Row r : expenses) {
			amounts.merge(key.apply(r), r.amount(), BigDecimal::add);
			counts.merge(key.apply(r), 1, Integer::sum);
		}
		return amounts.entrySet().stream()
			.map(e -> {
				Label l = e.getKey() == null ? null : labels.get(e.getKey());
				return new Slice(e.getKey(), l == null ? null : l.name(), l == null ? null : l.color(), e.getValue(), counts.get(e.getKey()));
			})
			.sorted(Comparator.comparing(Slice::amount).reversed())
			.toList();
	}

	private static Avoidable avoidable(List<Row> expenses) {
		BigDecimal yes = BigDecimal.ZERO, partly = BigDecimal.ZERO, no = BigDecimal.ZERO, untagged = BigDecimal.ZERO;
		int tagged = 0;
		for (Row r : expenses) {
			if (r.avoidable() == null) { untagged = untagged.add(r.amount()); continue; }
			tagged++;
			switch (r.avoidable()) {
				case "Yes" -> yes = yes.add(r.amount());
				case "Partly" -> partly = partly.add(r.amount());
				default -> no = no.add(r.amount());
			}
		}
		return new Avoidable(yes, partly, no, untagged, tagged, expenses.size());
	}

	private static Recurrence recurrence(List<Row> expenses) {
		BigDecimal fixed = BigDecimal.ZERO, recurring = BigDecimal.ZERO, oneOff = BigDecimal.ZERO, untagged = BigDecimal.ZERO;
		int tagged = 0;
		for (Row r : expenses) {
			if (r.recurrence() == null) { untagged = untagged.add(r.amount()); continue; }
			tagged++;
			switch (r.recurrence()) {
				case "Fixed" -> fixed = fixed.add(r.amount());
				case "Recurring" -> recurring = recurring.add(r.amount());
				default -> oneOff = oneOff.add(r.amount());
			}
		}
		return new Recurrence(fixed, recurring, oneOff, untagged, tagged, expenses.size());
	}

	// A record dated outside its assigned month (e.g. a bill paid late) or undated is placed
	// on the nearest valid day of that month, so it is never dropped from the trend.
	private static int dayIndex(Row r, int monthLength) {
		return r.day() == null ? 0 : Math.min(r.day().getDayOfMonth(), monthLength) - 1;
	}

	private static boolean within(LocalDate d, LocalDate start, LocalDate end) {
		return !d.isBefore(start) && !d.isAfter(end);
	}

	private static BigDecimal sum(List<Row> rows) {
		return rows.stream().map(Row::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
	}

	private static BigDecimal net(List<Row> rows) {
		return rows.stream().map(r -> r.income() ? r.amount() : r.amount().negate()).reduce(BigDecimal.ZERO, BigDecimal::add);
	}

	private static BigDecimal[] zeros(int n) {
		BigDecimal[] a = new BigDecimal[n];
		java.util.Arrays.fill(a, BigDecimal.ZERO);
		return a;
	}

	private static BigDecimal[] cumulative(BigDecimal[] daily) {
		BigDecimal[] c = new BigDecimal[daily.length];
		BigDecimal run = BigDecimal.ZERO;
		for (int i = 0; i < daily.length; i++) c[i] = run = run.add(daily[i]);
		return c;
	}
}
