import { analyzeController } from '../src/controllers/analyze.mjs'

export default async function handler(req, res) {
  // 1. Manually Handle CORS (Since we removed Express)
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*') // Allow all for demo
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )

  // 2. Handle Preflight (Browser checks permission)
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  // 3. Pass request to your existing logic
  // Vercel request/response objects are compatible with Express controllers
  return analyzeController(req, res)
}