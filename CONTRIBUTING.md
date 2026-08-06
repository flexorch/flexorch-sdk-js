# Contributing

## Setup

```bash
npm install
npm run build
npm test
sh scripts/install-git-hooks.sh
```

The last command installs a local `pre-push` hook that runs `npm test`, `npm run typecheck`, and `npm run build` before every push. CI (`npm test` + `npm run build`) doesn't run `tsc --noEmit` as its own step, so a type error can slip past CI's build step; the hook catches it locally instead. Run the install script once after cloning — `.git/hooks/` isn't tracked by git, so this doesn't happen automatically.

## Tests

```bash
npm test              # run all tests once
npm test -- --watch   # watch mode
```

All tests live in `tests/`. Use `mockFetch` from `tests/helpers.ts` — never hit the real API in unit tests.

**Key rule:** always use `mockImplementation`, not `mockResolvedValue`, for fetch mocks. `Response` bodies can only be read once; `mockImplementation` creates a fresh `Response` per call.

## Code style

- TypeScript strict mode — no `any`, no `as unknown`
- `exactOptionalPropertyTypes` is intentionally off (incompatible with RequestInit body assignment)
- No runtime dependencies — use native `fetch` and `FormData` only
- Errors must extend `FlexOrchError` from `src/errors.ts`

## Adding a new resource

1. Create `src/resources/<name>.ts` following the pattern in `src/resources/connectors.ts`
2. Export from `src/index.ts`
3. Wire to `FlexOrchClient` in `src/client.ts`
4. Add tests in `tests/resources.test.ts`

## Adding a new model

1. Create `src/models/<name>.ts`
2. Add a static `fromDict(raw: unknown, transport: Transport)` factory
3. Export from `src/index.ts`

## Pull requests

- One feature / fix per PR
- Tests required for new code
- Update `CHANGELOG.md` under `[Unreleased]`
- CI must pass (Node 18 / 20 / 22)

## Security

Report vulnerabilities privately to security@flexorch.com — do not open a public issue.
