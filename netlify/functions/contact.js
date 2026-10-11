// Receives the contact form, validates it, saves it to Supabase,
// and sends an email notification through Resend.

const headers = {
  "Access-Control-Allow-Origin": "*", // lets other websites (students' portfolios) call this
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const reply = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  // Browsers send an OPTIONS "preflight" request before the real POST
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "POST") return reply(405, { error: "Use POST" });

  // 1. Read the data
  let data;
  try {
    data = JSON.parse(event.body);
  } catch {
    return reply(400, { error: "Invalid data" });
  }

  const name = (data.name || "").trim();
  const email = (data.email || "").trim();
  const subject = (data.subject || "").trim();
  const message = (data.message || "").trim();

  // 2. Validate (never trust the browser, anyone can send requests directly)
  if (!name || !email || !subject || !message) {
    return reply(400, { error: "All fields are required." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply(400, { error: "Please enter a valid email." });
  }
  if (name.length > 100 || subject.length > 150 || message.length > 2000) {
    return reply(400, { error: "Message is too long." });
  }

  // 3. Save to the database
  const key = process.env.SUPABASE_SERVICE_KEY;
  const dbRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/messages`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ name, email, subject, message }),
  });
  if (!dbRes.ok) return reply(500, { error: "Could not save your message." });

  // 4. Email notification (if this fails, the message is still saved)
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Portfolio <onboarding@resend.dev>",
        to: process.env.NOTIFY_EMAIL,
        subject: `New message: ${subject}`,
        text: `From: ${name} (${email})\n\n${message}`,
      }),
    });
  } catch (err) {
    console.log("Email failed:", err.message);
  }

  return reply(200, { ok: true });
};
