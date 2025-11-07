import request from 'supertest'
import app from '../server.js'

describe('Backend API', () => {
  it('GET /health should return ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('GET /api should return api info', async () => {
    const res = await request(app).get('/api')
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/Instagram Automation API/i)
  })

  it('GET unknown route returns 404 json error', async () => {
    const res = await request(app).get('/nope')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe(true)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})


