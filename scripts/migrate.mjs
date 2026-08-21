/**
 * Applies every .sql file in lib/db/migrations, in filename order.
 *
 * There is no migrations tracking table on purpose: this repo has no migration
 * tooling, so every migration here MUST be written idempotently (`add column if
 * not exists`, `create ... if not exists`). That keeps re-running it harmless.
 *
 * Usage:  DATABASE_URL="postgres://..." npm run migrate
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import pg from "pg"

const DIR = "lib/db/migrations"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("Falta DATABASE_URL. Uso: DATABASE_URL=\"postgres://...\" npm run migrate")
  process.exit(1)
}

// Print where we are about to write, without leaking the password.
let target = "(url ilegible)"
try {
  const parsed = new URL(url)
  target = `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`
} catch {}

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()
if (files.length === 0) {
  console.log("No hay migraciones que aplicar.")
  process.exit(0)
}

const client = new pg.Client({ connectionString: url })
await client.connect()

const { rows } = await client.query("select current_database() as db, current_user as usr")
console.log(`Base de datos: ${rows[0].db} en ${target} (usuario ${rows[0].usr})`)
console.log(`Migraciones a aplicar: ${files.length}\n`)

for (const file of files) {
  const sql = readFileSync(join(DIR, file), "utf8")
  try {
    await client.query("begin")
    await client.query(sql)
    await client.query("commit")
    console.log(`  ok      ${file}`)
  } catch (error) {
    await client.query("rollback")
    console.error(`  FALLO   ${file}: ${error.message}`)
    process.exitCode = 1
    break
  }
}

await client.end()
if (!process.exitCode) console.log("\nListo. Ya puedes desplegar.")
