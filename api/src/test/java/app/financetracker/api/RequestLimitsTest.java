package app.financetracker.api;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Collections;
import java.util.List;
import java.util.Properties;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.jackson.autoconfigure.JacksonAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import tools.jackson.core.exc.StreamConstraintsException;
import tools.jackson.databind.json.JsonMapper;

/** The JSON size cap in application.properties fits the largest real import and refuses anything bigger. */
class RequestLimitsTest {

	static final String KEY = "spring.jackson.factory.constraints.read.max-document-length";

	@Test
	void fullImportFitsOversizedBodyIsRefused() throws Exception {
		var props = new Properties();
		props.load(getClass().getResourceAsStream("/application.properties"));
		int limit = Integer.parseInt(props.getProperty(KEY));
		new ApplicationContextRunner().withConfiguration(AutoConfigurations.of(JacksonAutoConfiguration.class))
			.withPropertyValues(KEY + "=" + limit)
			.run(ctx -> {
				JsonMapper json = ctx.getBean(JsonMapper.class);
				String row = "{\"dateTime\":\"2026-11-13T10:11:32\",\"description\":\"" + "é".repeat(200)
					+ "\",\"amount\":999999999.99,\"type\":\"Expense\",\"categoryId\":\"" + UUID.randomUUID() + "\"}";
				byte[] fullImport = ("[" + String.join(",", Collections.nCopies(5000, row)) + "]").getBytes(UTF_8);
				assertThat(json.readValue(fullImport, List.class)).hasSize(5000);
				byte[] tooBig = ("[\"" + "x".repeat(limit) + "\"]").getBytes(UTF_8);
				assertThatThrownBy(() -> json.readValue(tooBig, List.class)).isInstanceOf(StreamConstraintsException.class);
			});
	}
}
