# syntax=docker/dockerfile:1

FROM node:20-trixie-slim AS builder
WORKDIR /build
# git is needed for github dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates && \
    rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:prod && \
    npm prune --omit=dev && \
    mv dist /app && \
    mv node_modules /app/node_modules

# SAPI 4 helper, see sapi4/
FROM rust:1-slim-trixie AS sapi4
WORKDIR /build
RUN rustup target add i686-pc-windows-msvc
COPY sapi4/Cargo.toml sapi4/Cargo.lock ./
COPY sapi4/.cargo .cargo
COPY sapi4/src src
RUN cargo build --release

# AquesTalk10 library and helper, see aquestalk/. The SDK is downloaded by aquestalk/setup.sh
FROM rust:1-slim-trixie AS aquestalk
WORKDIR /build
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates unzip && \
    rm -rf /var/lib/apt/lists/*
COPY aquestalk/Cargo.toml aquestalk/Cargo.lock aquestalk/setup.sh ./
COPY aquestalk/src src
RUN AQUESTALK_DIR=/opt/aquestalk bash setup.sh

FROM node:20-trixie-slim AS runtime
WORKDIR /app
# SAPI 4 engines are 32-bit, so wine needs i386 support
RUN dpkg --add-architecture i386 && \
    apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg wine wine32:i386 wine64 curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*
ENV SAPI4_PREFIX=/opt/sapi4 \
    AQUESTALK_DIR=/opt/aquestalk
RUN --mount=type=bind,source=sapi4/setup.sh,target=/tmp/sapi4/setup.sh \
    --mount=type=bind,from=sapi4,source=/build/target/i686-pc-windows-msvc/release/sapi4.exe,target=/tmp/sapi4/sapi4.exe \
    SAPI4_EXE=/tmp/sapi4/sapi4.exe bash /tmp/sapi4/setup.sh
ENV PORT=80
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=5s --retries=2 CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
COPY --from=aquestalk /opt/aquestalk /opt/aquestalk
COPY --from=builder /app .
CMD ["npm", "start"]
