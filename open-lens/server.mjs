import express from 'express'
import cors from 'cors'
import { analyzeController } from './src/controllers/analyze.js'

const app = express()
app.use(cors())
app.use(express.json())

// --- ROUTES ---
app.post('/api/analyze', analyzeController)

// --- START ---
const PORT = 3000
app.listen(PORT, () => console.log(`🧠 Platform Brain running on http://localhost:${PORT}`))