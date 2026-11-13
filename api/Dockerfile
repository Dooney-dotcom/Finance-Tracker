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
COPY --from=build /src/target/api-0.0.1-SNAPSHOT.jar /app.jar
# Cloud Run injects PORT; config comes from env vars (see .env.example).
# Out of memory: exit so Cloud Run starts a fresh instance instead of limping on.
ENTRYPOINT ["java", "-XX:+ExitOnOutOfMemoryError", "-jar", "/app.jar"]
