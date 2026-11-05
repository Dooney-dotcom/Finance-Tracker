package app.financetracker.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;

import app.financetracker.api.RevolutCsv.Status;

class RevolutCsvTest {

	// Shaped like a real Italian export. Invented rows.
	static final String IT = """
		Tipo,Prodotto,Data di inizio,Data di completamento,Descrizione,Importo,Costo,Valuta,State,Saldo
		Pagamento con carta,Attuale,2026-09-30 12:17:17,2026-10-01 10:54:21,Supermarket,-31.40,0.00,EUR,COMPLETATO,500.00
		Pagamento,Attuale,2026-10-05 02:00:00,2026-10-05 13:37:25,Example Gym S.r.l.,-40.00,0.00,EUR,COMPLETATO,460.00
		Ricarica,Attuale,2026-10-20 15:06:25,2026-10-20 15:06:25,Pagamento da MARIO ROSSI,100.00,0.00,EUR,COMPLETATO,560.00
		Pagamento con carta,Attuale,2026-10-24 03:06:22,,Metro ticket,-2.00,0.00,EUR,OPERAZIONE ANNULLATA,
		Pagamento con carta,Attuale,2026-10-26 10:00:00,2026-10-27 10:00:00,"Bar, Caffè ""Roma""\",-3.50,0.10,EUR,COMPLETATO,10.00
		Pagamento con carta,Attuale,2026-10-27 10:00:00,2026-10-28 10:00:00,London Shop,-9.00,0.00,GBP,COMPLETATO,10.00
		""";

	@Test
	void readsTheItalianExportLikeTheOwnersData() {
		var lines = RevolutCsv.parse(IT);
		assertThat(lines).hasSize(6);

		var first = lines.get(0);
		assertThat(first.status()).isEqualTo(Status.NEW);
		assertThat(first.startedAt()).isEqualTo(LocalDateTime.of(2026, 9, 30, 12, 17, 17)); // start date, not completion
		assertThat(first.amount()).isEqualByComparingTo("31.40");
		assertThat(first.income()).isFalse();

		assertThat(lines.get(1).status()).isEqualTo(Status.NEW); // direct debit counts as an expense
		assertThat(lines.get(2).status()).isEqualTo(Status.SKIPPED); // top-up
		assertThat(lines.get(3).status()).isEqualTo(Status.SKIPPED); // cancelled

		var quoted = lines.get(4);
		assertThat(quoted.description()).isEqualTo("Bar, Caffè \"Roma\"");
		assertThat(quoted.amount()).isEqualByComparingTo("3.60"); // fee added to the expense

		assertThat(lines.get(5).status()).isEqualTo(Status.FLAGGED); // not EUR
	}

	@Test
	void readsTheEnglishExport() {
		var lines = RevolutCsv.parse("""
			Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
			Card Payment,Current,2026-10-01 12:31:32,2026-10-02 10:14:08,Train ticket,-20.00,0.00,EUR,COMPLETED,480.00
			Topup,Current,2026-10-24 12:44:55,2026-10-24 12:44:57,Apple Pay top-up,50.00,0.00,EUR,COMPLETED,530.00
			""");
		assertThat(lines).extracting(RevolutCsv.Line::status).containsExactly(Status.NEW, Status.SKIPPED);
	}

	@Test
	void rejectsFilesThatAreNotRevolutStatements() {
		assertThatThrownBy(() -> RevolutCsv.parse("date,amount\n2026-01-01,5")).hasMessageContaining("Revolut");
	}
}
