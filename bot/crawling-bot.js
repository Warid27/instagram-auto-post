import dotenv from 'dotenv'
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'
import winston from 'winston'
import 'winston-daily-rotate-file'
import path from 'path'
import { fileURLToPath } from 'url'
import { crawlAccountPosts } from './helpers/crawling.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CONFIG = {
	headless: process.env.HEADLESS !== 'false',
	pageLoadTimeoutMs: parseInt(process.env.PAGE_LOAD_TIMEOUT || '60000', 10),
	maxPosts: parseInt(process.env.CRAWL_MAX_POSTS || '12', 10)
}

const supabase = createClient(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Logger (file + console)
const transport = new (winston.transports.DailyRotateFile)({
	dirname: path.join(__dirname, 'logs'),
	filename: 'crawling-bot-%DATE%.log',
	datePattern: 'YYYY-MM-DD',
	zippedArchive: true,
	maxSize: '10m',
	maxFiles: '7d',
})
const logger = winston.createLogger({
	level: (process.env.LOG_LEVEL || 'info').toLowerCase(),
	format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
	transports: [transport, new winston.transports.Console({ format: winston.format.simple() })],
})
function log(level, message, meta = {}) {
	const valid = ['error', 'warn', 'info', 'verbose', 'debug', 'silly']
	const lvl = valid.includes(level) ? level : 'info'
	if (typeof logger[lvl] === 'function') logger[lvl](message, meta)
	else logger.info(message, meta)
}

async function logActivity(type, message, details = {}) {
	try {
		log(type, message, { details })
		const payload = {
			action: message,
			status: type,
			details: typeof details === 'string' ? { details } : details,
		}
		await supabase.from('bot_logs').insert(payload)
	} catch {}
}

async function resolveAccounts(targetUsername = null) {
	if (targetUsername) {
		const { data, error } = await supabase
			.from('accounts')
			.select('*')
			.ilike('instagram_username', targetUsername)
			.limit(1)
		if (error) throw error
		return data || []
	}
	const { data, error } = await supabase
		.from('accounts')
		.select('*')
		.eq('is_active', true)
	if (error) throw error
	return data || []
}

function formatAnalytics(posts) {
	const lines = []
	lines.push('Post Analytics')
	for (const p of posts) {
		lines.push(`${p.url}`)
		lines.push(`Likes: ${p.likesCount}`)
		lines.push(`Comments: ${p.commentsCount}`)
	}
	return lines.join('\n')
}

export async function runCrawling({ username = null, maxPosts = CONFIG.maxPosts } = {}) {
	let browser = null
	try {
		log('info', '🕷️ Starting crawling bot', { username, maxPosts })
		await logActivity('info', 'Crawling started', { username, maxPosts })
		browser = await puppeteer.launch({
			headless: CONFIG.headless,
			args: [
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-dev-shm-usage',
				'--disable-accelerated-2d-canvas',
				'--disable-gpu'
			]
		})
		const page = await browser.newPage()
		page.setDefaultNavigationTimeout(CONFIG.pageLoadTimeoutMs)
		await page.setViewport({ width: 1920, height: 1080 })

		const accounts = await resolveAccounts(username)
		if (!accounts.length) {
			log('warn', 'No accounts found to crawl', { username })
			await logActivity('warning', 'No accounts found to crawl', { username })
			return { success: true, results: [] }
		}

		const results = []
		for (const account of accounts) {
			log('info', `Crawling @${account.instagram_username}`)
			await logActivity('info', 'Crawling account', { accountId: account.id, username: account.instagram_username })
			const crawl = await crawlAccountPosts(page, account, { maxPosts })
			if (!crawl.success) {
				log('warn', `Failed crawling @${account.instagram_username}`, { error: crawl.error })
				await logActivity('error', 'Crawling failed', { accountId: account.id, username: account.instagram_username, error: crawl.error })
				results.push({
					account: account.instagram_username,
					success: false,
					error: crawl.error
				})
				continue
			}
			await logActivity('success', 'Crawling completed', {
				accountId: account.id,
				username: account.instagram_username,
				postCount: crawl.posts?.length || 0
			})
			results.push({
				account: account.instagram_username,
				success: true,
				posts: crawl.posts
			})

			// Print to console as requested
			console.log(formatAnalytics(crawl.posts))
		}

		return { success: true, results }
	} catch (err) {
		log('error', 'Crawling bot failed', { error: err.message })
		await logActivity('error', 'Crawling bot failed', { error: err.message })
		return { success: false, error: err.message }
	} finally {
		if (browser) {
			try { await browser.close() } catch {}
		}
	}
}

// CLI usage:
// node crawling-bot.js --username=<insta_username> --maxPosts=12
const isMainModule = process.argv[1] && (
	process.argv[1].endsWith('crawling-bot.js') ||
	process.argv[1].endsWith('crawling-bot')
)
if (isMainModule) {
	const args = Object.fromEntries(
		process.argv.slice(2)
			.map(s => s.replace(/^-+/, '').split('='))
			.map(([k, v]) => [k, v ?? true])
	)
	const username = args.username || null
	const maxPosts = args.maxPosts ? parseInt(args.maxPosts, 10) : CONFIG.maxPosts
	runCrawling({ username, maxPosts })
}


