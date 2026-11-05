package app.financetracker.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import app.financetracker.api.WealthController.Account;

class WealthTest {

	static Account account(String purpose, String cls, String opened, String closed, String target) {
		return new Account(null, "  FTSE ", "", purpose, cls, "#6250D6", null, LocalDate.parse(opened),
			closed == null ? null : LocalDate.parse(closed), null, target == null ? null : new BigDecimal(target), " ", 0);
	}

	@Test
	void cleansAValidAccount() {
		Account a = WealthController.validate(account("Long-term investing", "Equities", "2026-01-01", null, "8000"));
		assertThat(a.name()).isEqualTo("FTSE");
		assertThat(a.institution()).isNull();
		assertThat(a.notes()).isNull();
		assertThat(a.color()).isEqualTo("#6250d6");
	}

	@Test
	void refusesBadInput() {
		assertThatThrownBy(() -> WealthController.validate(account("Fun", "Equities", "2026-01-01", null, null))).isInstanceOf(ResponseStatusException.class);
		assertThatThrownBy(() -> WealthController.validate(account("Savings", "Gold", "2026-01-01", null, null))).isInstanceOf(ResponseStatusException.class);
		assertThatThrownBy(() -> WealthController.validate(account("Savings", "Cash", "2026-01-15", null, null))).isInstanceOf(ResponseStatusException.class);
		assertThatThrownBy(() -> WealthController.validate(account("Savings", "Cash", "2026-03-01", "2026-03-01", null))).isInstanceOf(ResponseStatusException.class);
		assertThatThrownBy(() -> WealthController.validate(account("Savings", "Cash", "2026-03-01", null, "0"))).isInstanceOf(ResponseStatusException.class);
	}
}
