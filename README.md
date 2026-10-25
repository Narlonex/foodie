# Foodie

Foodie is a full-stack nutrition and meal tracker built with Next.js (App Router), TypeScript, PostgreSQL and the Open Food Facts API. It is designed for a premium dark-first, green-accented experience with a complete light theme and English/Slovak interfaces.

The application is a working MVP, not a clickable mockup: accounts, diaries, custom foods, favorites, saved meals, day types, settings and weekly history are persisted in PostgreSQL and scoped to the signed-in user.

## Features

- **Daily dashboard and diary** — previous/next day navigation, a date picker, calories consumed/remaining, macro progress, meal subtotals, and additional nutrients (sugars, saturated fat, fibre, salt).
- **Real food lookup** — server-side search and barcode lookup through Open Food Facts. Results are normalized, ranked with a preference for Slovak/Czech products while retaining international results, and clearly attributed.
- **Normal food-entry flow** — open a meal, search, choose a product, enter grams/millilitres/servings, preview the calculated nutrition, confirm the meal, and save. Breakfast, Lunch, Dinner and Snacks are the meal groups.
- **Trust the data** — every result shows its source (Open Food Facts, USDA FoodData Central or user-created), serving basis, barcode/brand when available, and whether data is complete. Missing nutrients stay **Unknown**; they are never replaced with zero.
- **Custom foods** — create, edit and delete user-entered foods with a serving basis and only the nutrition fields the user knows.
- **Favorites, recents and quick add** — favorites persist; recents come from actual diary entries; quick add keeps the amount and meal confirmation step.
- **Saved meals** — save a named set of foods and amounts, edit it, and log its contents to any date/meal.
- **Copy Day and Repeat Meal** — copy quantities between dates/meals with a destination preview. Existing entries are preserved; an explicit confirmation is required before duplicates are created.
- **Day types** — create named day types with their own calorie, protein, carbohydrate and fat targets, assign them to specific dates, and switch a date's type without changing logged food. A default day type supplies targets on unassigned dates.
- **Macro adjustment modes** — *Change carbs*, *Change fats*, *Change proteins* and *Change all* behave distinctly. Fixed macros keep their gram values; the selected macro absorbs the remaining calories using 4/4/9 kcal per gram. *Change all* uses the stored 30/40/30 default split (editable percentage fields). Impossible combinations are blocked with a translated explanation rather than creating negative targets.
- **Goals** — cut, maintenance and bulk presets are optional starting points. Maintenance calories and targets remain editable. No medical formula or personal target is imposed.
- **Weekly overview and history** — real persisted data only, day-specific calorie target comparison, macro summaries, days with no entries distinguished from days whose data is incomplete, and links back to each diary.
- **Settings** — clean icon/title/chevron list with explanations inside each detail screen: Nutrition goals, Day types, Appearance, Language, Units, Food data and Account.
- **Themes and languages** — dark/light theme and English/Slovak are stored on the profile and survive reloads and sessions.
- **Accounts** — real email/password registration and login with scrypt password hashing, hashed opaque session tokens in HTTP-only cookies, CSRF origin checks, and per-user ownership checks on every query.
- **Responsive and accessible** — mobile-first layouts, semantic landmarks, keyboard-operable dialogs, visible focus, labelled icon controls, progress text alternatives, reduced-motion support and no hover-only actions.

## Explicit non-features

- **No Smart Add.** There is no free-text multi-food parser, hidden button, disabled menu item or placeholder.
- **No AI features.** There is no AI nutrition estimate, image recognition, fake AI endpoint or AI-generated food data.
- **No camera barcode scanner in this build.** Manual barcode entry and API lookup are implemented. Camera scanning is deferred rather than mocked; see [Deferred work](#deferred-work).

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 App Router, React 19, TypeScript |
| Styling | A single token-driven global design system in `src/app/globals.css` |
| Database | PostgreSQL (Neon in production) through `pg` with parameterized SQL |
| Validation | Zod schemas shared by server actions and client forms |
| Tests | Vitest unit tests plus optional PostgreSQL integration tests |
| Food data | Open Food Facts REST API, optional USDA FoodData Central API |

## Recovered requirements and assumptions

The original planning conversation was not accessible while this build was completed. The requirements below come from the supplied build brief and its addendum; where the original wording could not be verified, the app uses a documented, configurable default.

- Meal groups: **Breakfast, Lunch, Dinner, Snacks** (explicit in the brief).
- Languages: **English and Slovak**, English as the default.
- Primary theme: **dark**, with vivid restrained green accents; a complete light theme is included.
- Day type names from the original discussion could **not** be verified. New accounts receive a configurable **“Standard day”** (Slovak: “Štandardný deň”) with 2000 kcal and a 30/40/30 protein/carb/fat split. “Workout Day”, “Rest Day” and “Cardio Day” are placeholder examples in the UI, not seeded or mandated.
- A personal preset of 160 g protein / 80 g fat is **not** applied to any account. The app deliberately does not seed personal targets; each user edits their own day types.
- The app stores calories in kcal and nutrients in grams. kJ is retained when a source provides it. Salt is stored in grams and taken from a source's salt field; a sodium field is not silently relabelled as salt.
- Calendar dates are stored as PostgreSQL `date` values and handled as date-only strings. “Today” is determined with `APP_TIMEZONE` (default `Europe/Bratislava`), so a diary date does not shift when rendered in another timezone.
- Missing energy is **not** guessed. Energy is taken from source data when present. Derived energy is used only when both macros are complete, calculated with the Atwater convention (protein 4, carbohydrate 4, fat 9 kcal/g), and marked as calculated. The dashboard and history state when totals are partial.
- Serving scaling is explicit: per-100 g foods take grams, per-100 ml foods take millilitres, and per-serving foods take a serving count. Imperial input (oz/fl oz) is converted to base units before saving.

## Prerequisites

- Node.js **20.9 or newer** (Node 22 LTS recommended)
- npm (the repository includes `package-lock.json`)
- A PostgreSQL **14+** database. For production, create a free Neon project and use its pooled connection string with `sslmode=require`.
- Internet access for Open Food Facts lookups. The app remains usable for custom foods, diary browsing and saved data when that API is unavailable.

## Local setup

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Create your local environment file and fill in the values:

   ```bash
   cp .env.example .env.local
   ```

   `DATABASE_URL` is required for all authenticated app pages. The app shows a configuration error page instead of pretending data is saved when it is missing.

3. Apply migrations to the database:

   ```bash
   npm run db:migrate
   ```

   The script reads `.env.local` automatically (`--env-file-if-exists`). It records applied files in `schema_migrations`, runs each migration in a transaction, and is safe to rerun. To use a different file or an exported value:

   ```bash
   DATABASE_URL="postgres://..." npm run db:migrate
   ```

4. Start development:

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000>, register an account, and create your first diary entry. A PostgreSQL connection is required; there is no in-memory fallback.

5. Production locally:

   ```bash
   npm run build
   npm start
   ```

   `scripts/start.mjs` honors `PORT` (default 3000) and binds `0.0.0.0`, matching Render’s web-service requirement.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL/Neon connection string. Server-only; never expose it to the browser. |
| `APP_TIMEZONE` | No | IANA timezone used to decide the current diary date. Defaults to `Europe/Bratislava`; invalid values fall back safely. |
| `OFF_CONTACT_EMAIL` | Recommended | Contact address inserted into the Open Food Facts User-Agent. Use a real address so the API operator can contact you. |
| `OFF_USER_AGENT` | No | Full custom User-Agent. Overrides the generated `Foodie/1.0 (OFF_CONTACT_EMAIL)` value. |
| `USDA_FDC_API_KEY` | No | Server-only USDA FoodData Central key. When absent, the shared `DEMO_KEY` is used, so USDA search works with low rate limits. A personal key is recommended for regular use. |

`.env.example` contains placeholders only. Never commit `.env`, `.env.local`, database credentials or API keys. `.env*` is gitignored except the example.

## Database and data model

The schema lives in [`db/migrations/001_init.sql`](db/migrations/001_init.sql). Main tables:

- `users` — normalized unique email, scrypt password hash.
- `sessions` — SHA-256 hash of an opaque random token, expiry, cascade delete with the user.
- `profiles` — language, theme, unit system, goal mode, optional maintenance calories and default day type.
- `day_types` — per-user named calorie/macro targets, adjustment mode and stored macro percentages. Unique per user by case-insensitive name.
- `day_assignments` — per-user, per-date day-type selection. Unique `(user_id, date)`; deleting an assigned type is restricted.
- `foods` — cached Open Food Facts/USDA records and user-created foods, with source, serving basis, precision-safe numeric nutrients, energy source and favorite flag.
- `diary_entries` — immutable snapshot of food nutrition at logging time, amount, amount unit, meal, date and timestamp. Foods can be deleted without erasing diary history (`ON DELETE SET NULL`).
- `saved_meals` and `saved_meal_items` — named food/amount combinations and validated references.

Indexes cover per-user/per-date diary reads, recent entries, favorites, source lookup, assignments and saved-meal items. All application queries scope by the authenticated user ID; no client-supplied owner ID is trusted.

### Migrations

```bash
npm run db:migrate   # reads .env.local or DATABASE_URL
```

There is one initial migration; add new numbered SQL files under `db/migrations/` and rerun the command. Migrations are not automatically applied by `npm run build` or by the app at runtime.

## Tests and checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run check        # typecheck + lint + unit tests
```

Unit tests cover nutrition scaling, unit conversion, missing nutrients, Atwater energy, meal/daily totals, macro adjustment modes and invalid combinations, validation, external API normalization, and translation-key completeness.

### Optional PostgreSQL integration tests

These exercise the real repositories, ownership boundaries, diary totals, day-type assignments and saved meals. They are skipped when no test database is configured.

1. Create a separate PostgreSQL database (a Neon branch is a good choice).
2. Apply migrations to it:
   ```bash
   DATABASE_URL="postgres://..." npm run db:migrate
   ```
3. Run:
   ```bash
   FOODIE_TEST_DATABASE_URL="postgres://..." npx vitest run tests/integration.test.ts
   ```

The tests create temporary users with random UUIDs and delete them afterwards, but use a dedicated test database rather than production.

## Deploying to Render with Neon

Foodie is a server application: it needs a persistent Node web service because authentication, server actions and database access run on the server. A static-only host cannot provide secure database access. Render’s ephemeral filesystem is not used for data; PostgreSQL/Neon is the durable store.

1. **Create Neon PostgreSQL**
   - Create a Neon project and database.
   - Copy the pooled connection string, including `sslmode=require`.
   - Keep it private. Do not put it in source control.

2. **Apply the schema to Neon**

   Locally, with the Neon URL in your shell or `.env.local`:

   ```bash
   DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require" npm run db:migrate
   ```

   Run this again whenever a new migration is added, before deploying the matching code.

3. **Push to GitHub** (the owner must do this explicitly; this build does not push).

4. **Create a Render Web Service**
   - Connect the repository.
   - Runtime: Node.
   - Build command: `npm ci && npm run build`.
   - Start command: `npm start`.
   - Health check path: `/api/health`.
   - Add the environment variables from the table above. Set `DATABASE_URL` from Neon as a secret. Add `OFF_CONTACT_EMAIL` (or `OFF_USER_AGENT`). Optionally add `USDA_FDC_API_KEY`.
   - Set `APP_TIMEZONE` if `Europe/Bratislava` is not your locale.

   A [`render.yaml`](render.yaml) blueprint with these commands and variables is included. Review it before creating the service; secrets are marked `sync: false` so Render prompts for them.

5. **Verify** — open the deployed URL, check `/api/health` returns `{ "status": "ok" }`, register/sign in, then add a food and reload to confirm persistence.

Migrations are intentionally a manual/release step. If you use a Render plan that supports a pre-deploy command, use `npm run db:migrate` there with the same `DATABASE_URL`; otherwise run it locally against Neon before each deploy.

## Food data sources and attribution

- **Open Food Facts** — <https://world.openfoodfacts.org/> · API docs <https://openfoodfacts.github.io/openfoodfacts-server/api/> · data under the Open Database License (ODbL). Foodie identifies Open Food Facts results in the UI, links to the source record when a barcode exists, sends a descriptive User-Agent, debounces search, aborts stale requests and caches lookups briefly.
- **USDA FoodData Central** — <https://fdc.nal.usda.gov/> · API guide <https://fdc.nal.usda.gov/api-guide>. Works by default through USDA's public `DEMO_KEY`; set a server-side `USDA_FDC_API_KEY` for regular use. Each account can turn USDA search on or off under Settings → Food data.
- **User-created foods** are labelled as such and are never presented as sourced from either API.

Search results show data completeness. A partial record is not treated as complete, and unknown nutrient values remain unknown through normalization, scaling, storage, display and totals. There is no invented quality score.

## Project structure

```text
db/migrations/             PostgreSQL schema and migration workflow
scripts/migrate.mjs        Transactional migration runner
scripts/start.mjs          Cross-platform production start command
src/app/                   App Router pages, layouts and API routes
src/actions/               Server actions with validation and auth checks
src/components/            Client/server UI components
src/i18n/                  English and Slovak dictionaries and translator
src/lib/                   Nutrition, macro targets, dates, auth, DB access
src/lib/foods/             Open Food Facts and USDA clients + normalization
src/lib/repositories/      User-scoped SQL repositories
tests/                     Vitest unit and optional integration tests
```

## Security notes

- Passwords are hashed with Node’s scrypt (salted, constant-time comparison) — never stored in plaintext.
- Session cookies are HTTP-only, `SameSite=Lax`, `Secure` in production, and contain an opaque token whose hash is stored server-side.
- Every private read/write is scoped by the authenticated user; repository integration tests cover cross-user isolation.
- SQL uses parameterized queries; external API payloads are validated at the boundary.
- Server actions validate input and use Next.js origin protections; errors shown to users are translated generic messages, not SQL/stack details.
- A restrictive Content Security Policy, `nosniff`, frame denial, referrer policy and production HSTS are applied. Camera/microphone/geolocation permissions are disabled because no such feature is implemented.

## Deferred work

- **Camera barcode scanning** is not implemented. It would require a tested scanner library, device permissions and HTTPS; the build intentionally avoids a fake camera button. Manual barcode entry is available in the food dialog.
- **USDA** works through the public `DEMO_KEY` with low limits; a personal API key is recommended for regular use. The rest of the app does not depend on it.
- Original planning-conversation details such as exact day-type names, if any, could not be verified. They are configurable rather than hardcoded, and the defaults above are documented assumptions.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run build` | Production build |
| `npm start` | Production server on `PORT` |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (integration tests when configured) |
| `npm run check` | Typecheck, lint and tests |
| `npm run db:migrate` | Apply pending SQL migrations |
