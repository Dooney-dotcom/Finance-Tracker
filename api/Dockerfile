FROM eclipse-temurin:17-jdk AS build
WORKDIR /src
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -q dependency:go-offline
COPY src src
RUN ./mvnw -q -DskipTests package

FROM eclipse-temurin:17-jre
RUN useradd --system --no-create-home app
USER app
WORKDIR /app
COPY --from=build /src/target/api-0.0.1-SNAPSHOT.jar /app.jar
# Supabase root CA, so DB_URL's sslrootcert=supabase-ca.crt resolves here as it does in api/ locally.
COPY supabase-ca.crt .
# Cloud Run injects PORT; config comes from env vars (see .env.example).
ENTRYPOINT ["java", "-jar", "/app.jar"]
