import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

// ✅ ตรวจสอบว่า env พร้อม
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.OPENAI_API_KEY) {
  throw new Error('❌ Missing environment variables')
}

// ✅ Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ✅ OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// ✅ API สร้างแผนเที่ยว
app.post('/generate-trip-plan', async (req, res) => {
  try {
    const { province, style, budget, days } = req.body

    console.log('📥 รับข้อมูล:', { province, style, budget, days })

    console.log("✅ BODY:", req.body);
console.log("📍 Searching for province:", province);

    // ✅ JOIN กับ destinations เพื่อเข้าถึง province
    const { data: activities, error } = await supabase
      .from('activities')
      .select('*, destinations!inner(province)')
      .ilike('destinations.province', `%${province}%`)

    if (error) {
      console.error('❌ Supabase error:', error)
      return res.status(500).json({ error: 'Failed to fetch activities' })
    }

    if (!activities || activities.length === 0) {
      return res.status(404).json({ error: 'No activities found for this province' })
    }

    console.log('📌 raw activities from Supabase:', activities)

    const activityText = activities
      .map((a) => `- ${a.name}: ${a.description || 'ไม่มีคำอธิบาย'}`)
      .join('\n')

    console.log('🧭 กิจกรรมที่ดึงมาจาก Supabase:', activityText)

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'คุณคือผู้ช่วยวางแผนเที่ยวที่ตอบกลับเป็นภาษาไทยเท่านั้น โดยใช้ข้อมูลกิจกรรมที่กำหนด'
        },
        {
          role: 'user',
          content: `
วางแผนเที่ยว ${province} สไตล์ ${style} เป็นเวลา ${days} วัน งบประมาณ ${budget} บาท
โดยใช้กิจกรรมเหล่านี้เท่านั้น:

${activityText}

แบ่งแผนเที่ยวเป็นรายวัน เช่น เช้า / บ่าย / เย็น และอย่าใช้กิจกรรมที่ไม่มีในรายการ
          `
        }
      ]
    })

    const aiResponse = completion.choices[0].message.content
    res.status(200).json({ plan: aiResponse })
  } catch (err) {
    console.error('❌ Error generating trip plan:', err)
    res.status(500).json({ error: 'Server Error' })
  }
})

// ✅ Start server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`)
})
