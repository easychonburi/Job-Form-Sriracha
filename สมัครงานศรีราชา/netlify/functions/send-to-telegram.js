// ไฟล์: netlify/functions/send-to-telegram.js (เวอร์ชันอัปเกรดสำหรับฟอร์มจริง)

exports.handler = async (event) => {
  // 1. ตรวจสอบ Method
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // 2. ดึง Secrets ทั้งหมด
  const { 
    TELEGRAM_BOT_TOKEN, 
    CHAT_ID_POS1, // ประจำ (จันทร์–ศุกร์ 09:00–17:00)
    CHAT_ID_POS2, // พาร์ทไทม์ (จันทร์–เสาร์ 17:00–23:00)
    CHAT_ID_POS3, // พาร์ทไทม์ (เฉพาะอาทิตย์ 10:30–20:00)
    TELEGRAM_CHAT_ID  // กลุ่มแอดมิน (Fallback)
  } = process.env;

  if (!TELEGRAM_BOT_TOKEN || !CHAT_ID_POS1 || !CHAT_ID_POS2 || !CHAT_ID_POS3) {
    return { statusCode: 500, body: 'Bot configuration missing one or more Chat IDs' };
  }

  // 3. ดึงข้อมูล
  const data = JSON.parse(event.body);
  const positionText = data.position || ""; // ดึงข้อความตำแหน่งที่เลือก

  // 4. Logic คัดแยกกลุ่ม (เหมือนเดิม)
  let targetChatId;
  if (positionText.includes("พนักงานประจำ")) {
    targetChatId = CHAT_ID_POS1;
  } else if (positionText.includes("จันทร์–เสาร์ 17:00–23:00")) {
    targetChatId = CHAT_ID_POS2;
  } else if (positionText.includes("เฉพาะวันอาทิตย์ 10:30–20:00")) {
    targetChatId = CHAT_ID_POS3;
  } else {
    targetChatId = TELEGRAM_CHAT_ID || CHAT_ID_POS1; // ส่งไปกลุ่มแอดมินหรือกลุ่ม 1
  }

  // 5. ฟังก์ชัน Escape (เหมือนเดิม)
  const escape = (str) => {
    if (!str) return 'N/A';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  // 6. !! ใหม่ !! จัดการประวัติการทำงานที่ซับซ้อน
  let workHistoryText = "N/A (ไม่เคยทำงาน)";
  if (data.workCount && parseInt(data.workCount, 10) > 0) {
    workHistoryText = `\n(เคยทำงาน ${escape(data.workCount)} ที่)\n`;
    if (data.workplace1) {
      workHistoryText += `<b>1. ${escape(data.workplace1)}</b>\n`;
      workHistoryText += `   <i>ตำแหน่ง:</i> ${escape(data.position1) || 'N/A'}\n`;
      workHistoryText += `   <i>สิ่งที่ทำ:</i> ${escape(data.description1) || 'N/A'}\n`;
    }
    if (data.workplace2) {
      workHistoryText += `<b>2. ${escape(data.workplace2)}</b>\n`;
      workHistoryText += `   <i>ตำแหน่ง:</i> ${escape(data.position2) || 'N/A'}\n`;
      workHistoryText += `   <i>สิ่งที่ทำ:</i> ${escape(data.description2) || 'N/A'}\n`;
    }
    if (data.workplace3) {
      workHistoryText += `<b>3. ${escape(data.workplace3)}</b>\n`;
      workHistoryText += `   <i>ตำแหน่ง:</i> ${escape(data.position3) || 'N/A'}\n`;
      workHistoryText += `   <i>สิ่งที่ทำ:</i> ${escape(data.description3) || 'N/A'}\n`;
    }
  }

  // 7. จัดรูปแบบข้อความ
  const startDate = data.start_date_type === 'immediate'
    ? 'พร้อมเริ่มงานทันที'
    : `วันที่: ${escape(data.specific_start_date) || '<i>ไม่ได้ระบุ</i>'}`;

  let text = `<b>🔔 มีใบสมัครงานใหม่!</b>\n\n`;
  text += `<b>ตำแหน่ง:</b> ${escape(data.position)}\n`;
  text += `<b>ชื่อ-สกุล:</b> ${escape(data.first_name)} ${escape(data.last_name)} (<b>${escape(data.nickname)}</b>)\n`;
  text += `<b>อายุ/นน./สูง:</b> ${escape(data.age)} ปี / ${escape(data.weight)} กก. / ${escape(data.height)} ซม.\n`;
  text += `<b>ติดต่อ:</b> ${escape(data.phone)} (Line: ${escape(data.line_id)})\n`;
  text += `<b>การศึกษา:</b> ${escape(data.education)}\n`;
  text += `<b>ที่อยู่:</b> ${escape(data.address)}\n`;
  text += `<b>เริ่มงาน:</b> ${startDate}\n`;
  text += `<b>ประวัติงาน:</b> ${workHistoryText}\n\n`;
  if (data.photo_url) {
    text += `<a href="${data.photo_url}"><b>🔗 ดูรูปถ่ายผู้สมัคร</b></a>`;
  } else {
    text += `<b>🔗 ดูรูปถ่ายผู้สมัคร:</b> <i>ไม่มีการแนบไฟล์</i>`;
  }

  // 8. ส่งไปที่ Telegram API
  const telegramBaseUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
  const sendTelegramRequest = async (endpoint, payload) => {
    const response = await fetch(`${telegramBaseUrl}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Telegram API error (${endpoint}): ${response.statusText}`);
    }

    return response.json();
  };

  try {
    if (data.photo_url) {
      const caption = `ตำแหน่ง: <b>${escape(data.position)}</b>\nชื่อ: <b>${escape(data.first_name)} ${escape(data.last_name)}</b>`;
      await sendTelegramRequest('sendPhoto', {
        chat_id: targetChatId,
        photo: data.photo_url,
        caption,
        parse_mode: 'HTML',
      });
    }

    await sendTelegramRequest('sendMessage', {
      chat_id: targetChatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: false, // ตั้งให้แสดง preview ลิงก์รูปได้
    });

    return { statusCode: 200, body: JSON.stringify({ message: 'Success' }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ message: error.message }) };
  }
};
