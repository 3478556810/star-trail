import axios from 'axios'

const API_KEY = import.meta.env.VITE_DEEPSEEK_KEY || 'sk-c768d6263fa74734a0678ec1048e3794' // 上线后只用环境变量

export async function chatWithAI(prompt) {
  try {
    const res = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-v4-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
      },
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )
    return res.data.choices[0].message.content
  } catch (err) {
    console.error('AI 调用失败:', err.response?.data || err)
    return ''
  }
}