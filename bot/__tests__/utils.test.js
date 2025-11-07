import { randomDelay, getBrowserConfig } from '../helpers/utils.js'

describe('Bot utils', () => {
  test('randomDelay returns within range', () => {
    const v = randomDelay(10, 20)
    expect(v).toBeGreaterThanOrEqual(10)
    expect(v).toBeLessThanOrEqual(20)
  })

  test('getBrowserConfig returns expected shape', () => {
    const cfg = getBrowserConfig()
    expect(cfg).toHaveProperty('headless')
    expect(cfg).toHaveProperty('args')
    expect(Array.isArray(cfg.args)).toBe(true)
    expect(cfg).toHaveProperty('defaultViewport')
  })
})


