import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

// ✅ ตรวจสอบว่า env ครบ
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.OPENAI_API_KEY) {
  throw new Error('❌ Missing environment variables')
}

// ✅ สร้าง Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ✅ สร้าง OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// ✅ API สร้างแผนเที่ยว
app.post('/generate-trip-plan', async (req, res) => {
  try {
    const { province, style, budget, days } = req.body
    console.log('📥 รับข้อมูล:', { province, style, budget, days })

    // ✅ ดึงกิจกรรม
    const { data: activities, error: activityError } = await supabase
      .from('activities')
      .select('*, destinations!inner(province)')
      .ilike('destinations.province', `%${province}%`)

    if (activityError) {
      console.error('❌ Supabase error (activities):', activityError)
      return res.status(500).json({ error: 'Failed to fetch activities' })
    }

    const activityText = activities
      .map((a) => `- ${a.name}: ${a.description || 'ไม่มีคำอธิบาย'}`)
      .join('\n')

    // ✅ ดึงร้านอาหาร
    const { data: restaurants, error: restaurantError } = await supabase
      .from('restaurants')
      .select('*')
      .ilike('province', `%${province}%`)

    if (restaurantError) {
      console.error('❌ Supabase error (restaurants):', restaurantError)
      return res.status(500).json({ error: 'Failed to fetch restaurants' })
    }

    const restaurantText = restaurants
      .map((r) => `- ${r.name}: ${r.description || 'ไม่มีคำอธิบาย'}`)
      .join('\n')

    // ✅ ดึงโรงแรม
    const { data: hotels, error: hotelError } = await supabase
      .from('hotels')
      .select('*')
      .ilike('province', `%${province}%`)

    if (hotelError) {
      console.error('❌ Supabase error (hotels):', hotelError)
      return res.status(500).json({ error: 'Failed to fetch hotels' })
    }

    const hotelText = hotels
      .map((h) => `- ${h.name}: ${h.description || 'ไม่มีคำอธิบาย'}`)
      .join('\n')

    // ✅ แสดง log ตรวจสอบ
    console.log('🧭 กิจกรรม:', activityText)
    console.log('🍛 ร้านอาหาร:', restaurantText)
    console.log('🏨 โรงแรม:', hotelText)

    // ✅ สร้าง Prompt ให้ GPT
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `คุณคือผู้ช่วยวางแผนเที่ยวที่ใช้เฉพาะข้อมูลจาก Supabase ที่ให้ไว้เท่านั้น ห้ามแต่งเพิ่มเอง`
        },
        {
          role: 'user',
          content: `
วางแผนเที่ยว **${province}** แบบ **${style}** จำนวน **${days} วัน** ด้วยงบประมาณระดับ **${budget}**

✅ ให้เลือกเฉพาะจากรายการเหล่านี้เท่านั้น:

🧭 **กิจกรรม**
${activityText}

🍛 **ร้านอาหาร**
${restaurantText}

🏨 **โรงแรม**
${hotelText}

📌 โปรดแบ่งแผนเป็น เช้า / บ่าย / เย็น สำหรับแต่ละวัน
📌 ห้ามเพิ่มสถานที่หรือกิจกรรมอื่นนอกเหนือจากนี้
📌 สรุปแผนให้อ่านง่าย
          `
        }
      ],
      temperature: 0.7
    })

    const aiResponse = completion.choices[0].message.content
    res.status(200).json({ plan: aiResponse })
  } catch (err) {
    console.error('❌ Error generating trip plan:', err)
    res.status(500).json({ error: 'Server Error' })
  }
})

// ✅ Start Server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`)
})
