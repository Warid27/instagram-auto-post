import { loginToInstagram } from './login.js'
import { decryptPassword } from '../utils/encryption.js'
import { getPostUrls, getPostStats } from './review.js'

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function random(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Crawl an account's recent posts and return analytics for each
 * Returns: { success, posts: [{ url, likesCount, commentsCount }], error? }
 */
export async function crawlAccountPosts(page, account, options = {}) {
	const {
		maxPosts = 12,
		delayBetweenPostsMs = { min: 1500, max: 3000 },
		includeViews = false
	} = options

	try {
		// 1) Login
		const savedCookies = account.cookies || null
		let password = null

		if (account.password_encrypted) {
			try {
				password = decryptPassword(account.password_encrypted)
			} catch (e) {
				throw new Error(`Failed to decrypt password: ${e.message}`)
			}
		}

		const loginResult = await loginToInstagram(
			page,
			account.instagram_username,
			password,
			savedCookies
		)

		if (!loginResult.success) {
			throw new Error(`Login failed: ${loginResult.error || 'Unknown error'}`)
		}

		// 2) Get post URLs
		const postUrls = await getPostUrls(page, account.instagram_username, maxPosts)

		// 3) Gather stats per post
		const posts = []
		for (const postUrl of postUrls) {
			try {
				const stats = await getPostStats(page, postUrl)
				posts.push({
					url: postUrl,
					likesCount: stats.likesCount || 0,
					commentsCount: stats.commentsCount || 0,
					...(includeViews ? { viewsCount: stats.viewsCount || 0 } : {})
				})
			} catch (e) {
				posts.push({
					url: postUrl,
					likesCount: 0,
					commentsCount: 0,
					...(includeViews ? { viewsCount: 0 } : {})
				})
			}
			await sleep(random(delayBetweenPostsMs.min, delayBetweenPostsMs.max))
		}

		return { success: true, posts }
	} catch (error) {
		return { success: false, error: error.message || 'Unknown error during crawl' }
	}
}


