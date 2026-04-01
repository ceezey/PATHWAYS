FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /workspace

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @pathways/api build

EXPOSE 4000
CMD ["pnpm", "--filter", "@pathways/api", "start"]
