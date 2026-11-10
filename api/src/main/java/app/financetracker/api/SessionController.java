package app.financetracker.api;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** Keep-alive: the web app calls it while you're active but not otherwise hitting the API. 401 once idle. */
@RestController
class SessionController {

	private final UserDb db;

	SessionController(UserDb db) {
		this.db = db;
	}

	@PostMapping("/api/session")
	ResponseEntity<Void> touch(@AuthenticationPrincipal Jwt jwt) {
		db.run(jwt, s -> null);
		return ResponseEntity.noContent().build();
	}
}
