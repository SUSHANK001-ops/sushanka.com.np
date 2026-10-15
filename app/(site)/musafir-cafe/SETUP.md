# Musafir Cafe Promise Wall — Setup

Everything you need to run the Promise Wall locally or in production.

## Environment variable

| Variable             | Required | Purpose                                                                 |
| -------------------- | -------- | ----------------------------------------------------------------------- |
| `PROMISE_WALL_DB_URL`| Yes      | MongoDB connection string for the Promise Wall's **own** database.      |

- `PROMISE_WALL_DB_URL` points at a **separate database** from the main
  `MONGODB_URI`. It may share a cluster, but the database (and therefore the
  URL) must be distinct, so wall notes stay isolated from the rest of the site's
  data.
- `lib/promiseWallDb.ts` opens this on a dedicated cached connection
  (`global.__promiseWallConn`), never the default Mongoose connection used by
  `lib/db.ts`.
- The variable may be left unset locally. Routes still import and the build still
  succeeds; only a live request to a wall endpoint throws (returns a 500) until
  the URL is provided.

See `.env.example` for the documented entry.

## Migrations: there are none — the indexes are the migration

There is **no migration-file system**. The Mongoose schema's declared indexes
*are* the migration:

- `created_at`
- `status`
- `(pos_x, pos_y)` (compound)

Mongo builds these automatically on the Promise Wall connection's first connect.
Nothing to run, generate, or apply — just set `PROMISE_WALL_DB_URL` and connect.

## Images

Images reuse the **existing Cloudinary configuration** in `lib/cloudinary.ts`
(the default-exported v2 client). No new Cloudinary credentials are introduced.

- Uploads are stored in the Cloudinary folder **`musafir-cafe`**.
- Both drawings (PNG) and photos (JPEG/PNG/WebP) go through the same uploader.

## API endpoints

All routes live under `app/api/musafir-cafe/`:

| Method   | Path                                      | Purpose                                  |
| -------- | ----------------------------------------- | ---------------------------------------- |
| `GET`    | `/api/musafir-cafe/notes`                 | List visible notes (keyset pagination).  |
| `POST`   | `/api/musafir-cafe/notes`                 | Create a note (requires sign-in).        |
| `DELETE` | `/api/musafir-cafe/notes/:id`             | Delete your own note (owner only).       |
| `POST`   | `/api/musafir-cafe/notes/:id/report`      | Report a note (auto-hides at 5 reports). |
| `POST`   | `/api/musafir-cafe/upload`                | Upload a drawing/photo to Cloudinary.    |
