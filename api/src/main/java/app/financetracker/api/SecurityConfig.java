package app.financetracker.api;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
class SecurityConfig {

	@Bean
	SecurityFilterChain api(HttpSecurity http, @Value("${app.cors.allowed-origins}") List<String> origins) throws Exception {
		var cors = new CorsConfiguration();
		cors.setAllowedOrigins(origins);
		cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE"));
		cors.setAllowedHeaders(List.of("Authorization", "Content-Type"));
		cors.setMaxAge(3600L);
		var corsSource = new UrlBasedCorsConfigurationSource();
		corsSource.registerCorsConfiguration("/api/**", cors);

		return http
			// Bearer tokens only, no cookies: CSRF does not apply.
			.csrf(c -> c.disable())
			.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.cors(c -> c.configurationSource(corsSource))
			.authorizeHttpRequests(a -> a
				.requestMatchers("/actuator/health").permitAll()
				.anyRequest().authenticated())
			.oauth2ResourceServer(o -> o.jwt(Customizer.withDefaults()))
			.build();
	}
}
