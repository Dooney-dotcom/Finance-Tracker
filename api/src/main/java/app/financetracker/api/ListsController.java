package app.financetracker.api;

import static app.financetracker.api.RecordsController.bad;
import static app.financetracker.api.RecordsController.user;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** The user's own categories and payment methods. */
@RestController
@RequestMapping("/api")
class ListsController {

	private static final Pattern COLOR = Pattern.compile("^#[0-9a-f]{6}$");

	record Category(UUID id, String name, String kind, String color, int records) {}
	record Method(UUID id, String name, int records) {}
	record Lists(List<Category> categories, List<Method> paymentMethods) {}
	record CategoryIn(String name, String kind, String color) {}
	record MethodIn(String name) {}

	private final UserDb db;

	ListsController(UserDb db) {
		this.db = db;
	}

	@GetMapping("/lists")
	Lists lists(@AuthenticationPrincipal Jwt jwt) {
		UUID uid = user(jwt);
		return db.run(jwt, s -> new Lists(
			s.sql("""
					select c.id, c.name, c.kind, c.color, count(t.id) from categories c
					left join transactions t on t.category_id = c.id
					where c.user_id = :uid group by c.id order by c.kind, lower(c.name)""")
				.param("uid", uid)
				.query((rs, i) -> new Category(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getString(4), rs.getInt(5))).list(),
			s.sql("""
					select p.id, p.name, count(t.id) from payment_methods p
					left join transactions t on t.payment_method_id = p.id
					where p.user_id = :uid group by p.id order by lower(p.name)""")
				.param("uid", uid)
				.query((rs, i) -> new Method(rs.getObject(1, UUID.class), rs.getString(2), rs.getInt(3))).list()));
	}

	// ---------- categories ----------

	@PostMapping("/categories")
	@org.springframework.web.bind.annotation.ResponseStatus(HttpStatus.CREATED)
	Map<String, UUID> createCategory(@AuthenticationPrincipal Jwt jwt, @RequestBody CategoryIn in) {
		String name = name(in.name());
		String color = color(in.color());
		if (!"expense".equals(in.kind()) && !"income".equals(in.kind())) throw bad("A category is for expenses or for income.");
		UUID uid = user(jwt);
		return unique(() -> Map.of("id", db.run(jwt, s -> s.sql("insert into categories (user_id, name, kind, color) values (:uid, :n, :k, :c) returning id")
			.param("uid", uid).param("n", name).param("k", in.kind()).param("c", color).query(UUID.class).single())));
	}

	@PutMapping("/categories/{id}")
	void updateCategory(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestBody CategoryIn in) {
		String name = name(in.name());
		String color = color(in.color());
		UUID uid = user(jwt);
		found(unique(() -> db.run(jwt, s -> s.sql("update categories set name = :n, color = :c where id = :id and user_id = :uid")
			.param("n", name).param("c", color).param("id", id).param("uid", uid).update())));
	}

	/** Refuses while records use it, unless `reassignTo` names another category of the same kind to move them to. */
	@DeleteMapping("/categories/{id}")
	ResponseEntity<Void> deleteCategory(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestParam(required = false) UUID reassignTo) {
		UUID uid = user(jwt);
		db.run(jwt, s -> {
			String kind = s.sql("select kind from categories where id = :id and user_id = :uid").param("id", id).param("uid", uid)
				.query(String.class).optional().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
			if (reassignTo != null) {
				if (reassignTo.equals(id)) throw bad("Pick a different category to move the records to.");
				String target = s.sql("select kind from categories where id = :id and user_id = :uid").param("id", reassignTo).param("uid", uid)
					.query(String.class).optional().orElseThrow(() -> bad("That category doesn’t exist."));
				if (!target.equals(kind)) throw bad("Records can only move to another " + kind + " category.");
				s.sql("update transactions set category_id = :to where category_id = :id and user_id = :uid")
					.param("to", reassignTo).param("id", id).param("uid", uid).update();
				s.sql("update plans set category_id = :to where category_id = :id and user_id = :uid")
					.param("to", reassignTo).param("id", id).param("uid", uid).update();
			}
			int used = s.sql("select (select count(*) from transactions where category_id = :id) + (select count(*) from plans where category_id = :id)")
				.param("id", id).query(Integer.class).single();
			if (used > 0) throw new ResponseStatusException(HttpStatus.CONFLICT, used + " records or plans use this category. Move them to another one first.");
			return s.sql("delete from categories where id = :id and user_id = :uid").param("id", id).param("uid", uid).update();
		});
		return ResponseEntity.noContent().build();
	}

	// ---------- payment methods ----------

	@PostMapping("/payment-methods")
	@org.springframework.web.bind.annotation.ResponseStatus(HttpStatus.CREATED)
	Map<String, UUID> createMethod(@AuthenticationPrincipal Jwt jwt, @RequestBody MethodIn in) {
		String name = name(in.name());
		UUID uid = user(jwt);
		return unique(() -> Map.of("id", db.run(jwt, s -> s.sql("insert into payment_methods (user_id, name) values (:uid, :n) returning id")
			.param("uid", uid).param("n", name).query(UUID.class).single())));
	}

	@PutMapping("/payment-methods/{id}")
	void updateMethod(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestBody MethodIn in) {
		String name = name(in.name());
		UUID uid = user(jwt);
		found(unique(() -> db.run(jwt, s -> s.sql("update payment_methods set name = :n where id = :id and user_id = :uid")
			.param("n", name).param("id", id).param("uid", uid).update())));
	}

	@DeleteMapping("/payment-methods/{id}")
	ResponseEntity<Void> deleteMethod(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestParam(required = false) UUID reassignTo) {
		UUID uid = user(jwt);
		db.run(jwt, s -> {
			s.sql("select 1 from payment_methods where id = :id and user_id = :uid").param("id", id).param("uid", uid)
				.query(Integer.class).optional().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
			if (reassignTo != null) {
				if (reassignTo.equals(id)) throw bad("Pick a different payment method to move the records to.");
				s.sql("select 1 from payment_methods where id = :id and user_id = :uid").param("id", reassignTo).param("uid", uid)
					.query(Integer.class).optional().orElseThrow(() -> bad("That payment method doesn’t exist."));
				s.sql("update transactions set payment_method_id = :to where payment_method_id = :id and user_id = :uid")
					.param("to", reassignTo).param("id", id).param("uid", uid).update();
				s.sql("update plans set payment_method_id = :to where payment_method_id = :id and user_id = :uid")
					.param("to", reassignTo).param("id", id).param("uid", uid).update();
			}
			int used = s.sql("select (select count(*) from transactions where payment_method_id = :id) + (select count(*) from plans where payment_method_id = :id)")
				.param("id", id).query(Integer.class).single();
			if (used > 0) throw new ResponseStatusException(HttpStatus.CONFLICT, used + " records or plans use this payment method. Move them to another one first.");
			return s.sql("delete from payment_methods where id = :id and user_id = :uid").param("id", id).param("uid", uid).update();
		});
		return ResponseEntity.noContent().build();
	}

	// ---------- helpers ----------

	private static String name(String raw) {
		String n = raw == null ? "" : raw.trim();
		if (n.isEmpty() || n.length() > 50) throw bad("Give it a name (up to 50 characters).");
		return n;
	}

	private static String color(String raw) {
		String c = raw == null ? "" : raw.trim().toLowerCase();
		if (!COLOR.matcher(c).matches()) throw bad("Pick a colour.");
		return c;
	}

	private static <T> T unique(java.util.function.Supplier<T> work) {
		try {
			return work.get();
		} catch (DuplicateKeyException e) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "You already have one with that name.");
		}
	}

	private static void found(int updated) {
		if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
	}
}
