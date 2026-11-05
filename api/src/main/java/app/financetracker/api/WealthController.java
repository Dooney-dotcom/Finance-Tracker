package app.financetracker.api;

import static app.financetracker.api.RecordsController.bad;
import static app.financetracker.api.RecordsController.user;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Wealth: accounts and their monthly balances, entered by hand. Not linked to records. */
@RestController
@RequestMapping("/api/wealth")
class WealthController {

	static final Set<String> PURPOSES = Set.of("Everyday", "Emergency fund", "Savings", "Long-term investing", "Retirement");
	static final Set<String> ASSET_CLASSES = Set.of("Cash", "Deposit", "Bonds", "Equities", "Mixed", "Insurance policy", "Pension fund");
	private static final Pattern COLOR = Pattern.compile("^#[0-9a-f]{6}$");
	private static final BigDecimal MAX = new BigDecimal("999999999999");

	record Account(UUID id, String name, String institution, String purpose, String assetClass, String color, LocalDate lockedUntil,
		LocalDate opened, LocalDate closed, BigDecimal contributedBefore, BigDecimal target, String notes, int sort) {}
	record Balance(UUID accountId, LocalDate month, BigDecimal value, BigDecimal contributed) {}
	record Wealth(List<Account> accounts, List<Balance> balances) {}
	/** One account's line in a check-in. A null value removes that month's balance. */
	record Entry(UUID accountId, BigDecimal value, BigDecimal contributed) {}

	private final UserDb db;

	WealthController(UserDb db) {
		this.db = db;
	}

	/** Everything at once: a few accounts times a few months is small enough for the page to do the maths. */
	@GetMapping
	Wealth get(@AuthenticationPrincipal Jwt jwt) {
		UUID uid = user(jwt);
		return db.run(jwt, s -> new Wealth(
			s.sql("""
					select id, name, institution, purpose, asset_class, color, locked_until, opened, closed, contributed_before, target, notes, sort
					from wealth_accounts where user_id = :uid order by sort, lower(name)""")
				.param("uid", uid)
				.query((rs, i) -> new Account(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5),
					rs.getString(6), rs.getObject(7, LocalDate.class), rs.getObject(8, LocalDate.class), rs.getObject(9, LocalDate.class),
					rs.getBigDecimal(10), rs.getBigDecimal(11), rs.getString(12), rs.getInt(13)))
				.list(),
			s.sql("select account_id, month, value, contributed from wealth_balances where user_id = :uid order by month")
				.param("uid", uid)
				.query((rs, i) -> new Balance(rs.getObject(1, UUID.class), rs.getObject(2, LocalDate.class), rs.getBigDecimal(3), rs.getBigDecimal(4)))
				.list()));
	}

	@PostMapping("/accounts")
	@ResponseStatus(HttpStatus.CREATED)
	Map<String, UUID> create(@AuthenticationPrincipal Jwt jwt, @RequestBody Account in) {
		Account a = validate(in);
		UUID uid = user(jwt);
		return saving(() -> Map.of("id", db.run(jwt, s -> s.sql("""
				insert into wealth_accounts (user_id, name, institution, purpose, asset_class, color, locked_until, opened, closed, contributed_before, target, notes, sort)
				values (:uid, :name, :inst, :purpose, :cls, :color, :locked, :opened, :closed, :before, :target, :notes,
				  coalesce((select max(sort) + 1 from wealth_accounts where user_id = :uid), 0))
				returning id""").params(params(uid, a)).query(UUID.class).single())));
	}

	@PutMapping("/accounts/{id}")
	void update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestBody Account in) {
		Account a = validate(in);
		UUID uid = user(jwt);
		int n = saving(() -> db.run(jwt, s -> s.sql("""
				update wealth_accounts set name = :name, institution = :inst, purpose = :purpose, asset_class = :cls, color = :color,
				  locked_until = :locked, opened = :opened, closed = :closed, contributed_before = :before, target = :target, notes = :notes
				where id = :id and user_id = :uid""").params(params(uid, a)).param("id", id).update()));
		if (n == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
	}

	/** Deletes the account and every balance recorded for it. The page asks first and suggests closing instead. */
	@DeleteMapping("/accounts/{id}")
	ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
		UUID uid = user(jwt);
		int n = db.run(jwt, s -> s.sql("delete from wealth_accounts where id = :id and user_id = :uid").param("id", id).param("uid", uid).update());
		if (n == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
		return ResponseEntity.noContent().build();
	}

	/** Saves a whole check-in for one month in one transaction. Accounts not listed are left as they are. */
	@PutMapping("/balances/{month}")
	void checkIn(@AuthenticationPrincipal Jwt jwt, @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate month, @RequestBody List<Entry> entries) {
		if (month.getDayOfMonth() != 1) throw bad("A balance belongs to a month: use its first day.");
		if (entries == null || entries.size() > 200) throw bad("Nothing to save.");
		for (Entry e : entries) {
			if (e == null || e.accountId() == null) throw bad("Every balance needs an account.");
			amount(e.value(), "balance");
			amount(e.contributed(), "amount put in");
			if (e.value() == null && e.contributed() != null) throw bad("Enter the balance as well as what you put in.");
		}
		UUID uid = user(jwt);
		saving(() -> db.run(jwt, s -> {
			for (Entry e : entries) write(s, uid, month, e);
			return null;
		}));
	}

	private static void write(JdbcClient s, UUID uid, LocalDate month, Entry e) {
		if (e.value() == null) {
			s.sql("delete from wealth_balances where account_id = :a and month = :m and user_id = :uid")
				.param("a", e.accountId()).param("m", month).param("uid", uid).update();
			return;
		}
		// The (account, user) foreign key refuses another user's account.
		s.sql("""
				insert into wealth_balances (account_id, user_id, month, value, contributed) values (:a, :uid, :m, :v, :c)
				on conflict (account_id, month) do update set value = excluded.value, contributed = excluded.contributed""")
			.param("a", e.accountId()).param("uid", uid).param("m", month).param("v", e.value()).param("c", e.contributed()).update();
	}

	// ---------- helpers ----------

	static Account validate(Account in) {
		String name = in.name() == null ? "" : in.name().trim();
		if (name.isEmpty() || name.length() > 50) throw bad("Give the account a name (up to 50 characters).");
		String inst = in.institution() == null || in.institution().isBlank() ? null : in.institution().trim();
		if (inst != null && inst.length() > 50) throw bad("Keep the institution under 50 characters.");
		if (!PURPOSES.contains(in.purpose())) throw bad("Pick what the account is for.");
		if (!ASSET_CLASSES.contains(in.assetClass())) throw bad("Pick what the money is held in.");
		String color = in.color() == null ? "" : in.color().trim().toLowerCase();
		if (!COLOR.matcher(color).matches()) throw bad("Pick a colour.");
		if (in.opened() == null || in.opened().getDayOfMonth() != 1) throw bad("Pick the first month to track.");
		if (in.closed() != null && (in.closed().getDayOfMonth() != 1 || !in.closed().isAfter(in.opened())))
			throw bad("An account can only close after the month it was opened.");
		amount(in.contributedBefore(), "amount put in");
		amount(in.target(), "target");
		if (in.contributedBefore() != null && in.contributedBefore().signum() < 0) throw bad("What you put in before can’t be negative.");
		if (in.target() != null && in.target().signum() <= 0) throw bad("A target must be above zero.");
		String notes = in.notes() == null || in.notes().isBlank() ? null : in.notes().trim();
		if (notes != null && notes.length() > 2000) throw bad("Keep notes under 2,000 characters.");
		return new Account(null, name, inst, in.purpose(), in.assetClass(), color, in.lockedUntil(), in.opened(), in.closed(),
			in.contributedBefore(), in.target(), notes, 0);
	}

	private static void amount(BigDecimal v, String what) {
		if (v != null && (v.abs().compareTo(MAX) > 0 || v.scale() > 2)) throw bad("That " + what + " doesn’t look right. Use at most two decimals.");
	}

	private static Map<String, Object> params(UUID uid, Account a) {
		var p = new java.util.HashMap<String, Object>();
		p.put("uid", uid);
		p.put("name", a.name());
		p.put("inst", a.institution());
		p.put("purpose", a.purpose());
		p.put("cls", a.assetClass());
		p.put("color", a.color());
		p.put("locked", a.lockedUntil());
		p.put("opened", a.opened());
		p.put("closed", a.closed());
		p.put("before", a.contributedBefore());
		p.put("target", a.target());
		p.put("notes", a.notes());
		return p;
	}

	private static <T> T saving(java.util.function.Supplier<T> work) {
		try {
			return work.get();
		} catch (DuplicateKeyException e) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "You already have an account with that name.");
		} catch (DataIntegrityViolationException e) {
			throw bad("That account doesn’t exist.");
		}
	}
}
