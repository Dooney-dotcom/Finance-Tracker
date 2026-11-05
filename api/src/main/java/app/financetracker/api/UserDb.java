package app.financetracker.api;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.function.Function;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The only way to touch the database. Each call runs in a transaction as the
 * Postgres `authenticated` role with the caller's verified JWT claims, so Supabase
 * RLS (ownership + 2FA) applies. The login role itself has no table access, so a
 * query outside this method fails instead of leaking.
 */
@Component
public class UserDb {

	private final JdbcClient jdbc;
	private final TransactionTemplate tx;

	UserDb(JdbcClient jdbc, TransactionTemplate tx) {
		this.jdbc = jdbc;
		this.tx = tx;
	}

	public <T> T run(Jwt jwt, Function<JdbcClient, T> work) {
		// The token is already signature-, issuer-, audience- and expiry-checked by Spring Security.
		String claims = new String(Base64.getUrlDecoder().decode(jwt.getTokenValue().split("\\.")[1]), StandardCharsets.UTF_8);
		return tx.execute(status -> {
			jdbc.sql("select set_config('request.jwt.claims', ?, true)").param(claims).query(String.class).single();
			jdbc.sql("set local role authenticated").update();
			return work.apply(jdbc);
		});
	}
}
