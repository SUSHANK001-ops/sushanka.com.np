import mongoose, { Connection } from 'mongoose'

const uri = process.env.PROMISE_WALL_DB_URL
// Do NOT throw at module load — the build imports this file. Throw at call time.

interface PromiseWallCache {
  conn: Connection | null
  promise: Promise<Connection> | null
}

// Distinct global key so it never collides with global.mongoose (main DB).
const g = global as unknown as { __promiseWallConn?: PromiseWallCache }
let cached = g.__promiseWallConn
if (!cached) cached = g.__promiseWallConn = { conn: null, promise: null }

export async function getPromiseWallConnection(): Promise<Connection> {
  if (!uri) throw new Error('PROMISE_WALL_DB_URL is not defined')
  if (cached!.conn) return cached!.conn
  if (!cached!.promise) {
    // createConnection returns a Connection; .asPromise() resolves when open.
    cached!.promise = mongoose.createConnection(uri).asPromise()
  }
  cached!.conn = await cached!.promise
  return cached!.conn
}
