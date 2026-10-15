FROM rust:1-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations
RUN cargo build --locked --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/wa-gateway-api /usr/local/bin/wa-gateway-api
COPY --from=builder /app/migrations ./migrations
USER 10001:10001
EXPOSE 8080
CMD ["wa-gateway-api"]
