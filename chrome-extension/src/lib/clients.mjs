import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'

dotenv.config()

// 1. Supabase
export const supabase = createClient(
  process.env.PLASMO_PUBLIC_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY     
)

// 2. OpenAI
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// 3. Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
export const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })