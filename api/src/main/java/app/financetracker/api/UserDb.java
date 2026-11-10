package app.financetracker.api;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.function.Function;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/**
 * The only way to touch the database. Each call runs in a transaction as the
 * Postgres `authenticated` role with the caller's verified JWT claims, so Supabase
 * RLS (ownership + 2FA + idle timeout) applies. The login role itself has no table
 * access, so a query outside this method fails instead of leaking.
 */
@Component
public class UserDb {

	static final String IDLE_EXPIRED = "Your session expired after a period of inactivity. Sign in again.";

	private final JdbcClient jdbc;
	private final TransactionTemplate tx;
	private final Duration idle;

	UserDb(JdbcClient jdbc, TransactionTemplate tx, @Value("${app.session.idle-timeout}") Duration idle) {
		this.jdbc = jdbc;
		this.tx = tx;
		this.idle = idle;
	}

	public <T> T run(Jwt jwt, Function<JdbcClient, T> work) {
		// The token is already signature-, issuer-, audience- and expiry-checked by Spring Security.
		String claims = new String(Base64.getUrlDecoder().decode(jwt.getTokenValue().split("\\.")[1]), StandardCharsets.UTF_8);
		return tx.execute(status -> {
			jdbc.sql("select set_config('request.jwt.claims', ?, true)").param(claims).query(String.class).single();
			jdbc.sql("set local role authenticated").update();
			// Every request counts as activity; an already idle session stays expired.
			if (!jdbc.sql("select private.touch_session(? * interval '1 second')").param(idle.toSeconds()).query(Boolean.class).single())
				throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, IDLE_EXPIRED);
			return work.apply(jdbc);
		});
	}
}
