import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'
import dotenv from 'dotenv'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function showResetInstructions() {
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('🧹 Development Reset: Review-related Tables & Policies')
  console.log('═══════════════════════════════════════════════════════════\n')

  const supabaseUrl = process.env.SUPABASE_URL
  if (!supabaseUrl) {
    console.error('❌ SUPABASE_URL not found in .env file\n')
    process.exit(1)
  }

  const urlMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)
  if (!urlMatch) {
    console.error('❌ Invalid Supabase URL format\n')
    process.exit(1)
  }

  const projectRef = urlMatch[1]

  const sql = `
-- DROP review-related objects (idempotent)
DROP TABLE IF EXISTS review_comments CASCADE;
DROP TABLE IF EXISTS account_review_posts CASCADE;
DROP TABLE IF EXISTS account_reviews CASCADE;
DROP TABLE IF EXISTS review_notifications CASCADE;

-- Optionally clean bot_logs of review entries (uncomment if desired)
-- DELETE FROM bot_logs WHERE action ILIKE '%Review%';
`

  console.log('1) Open Supabase SQL Editor:')
  console.log(`   👉 https://supabase.com/dashboard/project/${projectRef}`)
  console.log('\n2) New query → paste the SQL below and run:')
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(sql)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  console.log('3) Re-run migrations for reviews:')
  console.log('   node backend/scripts/run-migration-003.js')
  console.log('   node backend/scripts/run-migration-004.js')
  console.log('   node backend/scripts/run-migration-005.js')
  console.log('\n4) Restart backend and bot processes.')
  console.log('\n✅ Done!')
}

showResetInstructions()
