# Contributing

## How to Contribute
1. Fork the repository and create a feature branch from `main`.
2. Write clear, incremental commits with descriptive messages.
3. Ensure tests pass locally across dashboard, backend, and bot.
4. Open a Pull Request describing the changes and motivation.

## Code Style Guidelines
- Follow the existing code style and formatting.
- Use descriptive variable and function names.
- Add JSDoc for public functions: params, returns, edge cases.
- Avoid logging secrets; redact sensitive fields.

## Testing
- Dashboard: `npm run test` (Vitest) in `dashboard/`.
- Backend: `npm test` (Jest) in `backend/`.
- Bot: `npm test` (Jest) in `bot/`.

## Pull Request Process
1. Link related issues and provide context/screenshots when applicable.
2. Include tests for new behavior.
3. Update docs (`docs/USER_GUIDE.md`, `docs/DEVELOPER.md`) if behavior changes.
4. The CI (if enabled) must pass before merge.

Thank you for contributing!
