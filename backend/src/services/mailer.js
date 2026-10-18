const { Resend } = require("resend");

const requiredVariables = ["RESEND_API_KEY", "EMAIL_FROM"];

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    throw new Error(`Missing required environment variable: ${variable}`);
  }
}

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail({ to, subject, text, html }) {
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text,
    html,
  });

  if (error) {
    // Avoid logging email content, OTPs, or credentials.
    console.error("Resend email delivery failed:", error.message);
    throw new Error(`Email delivery failed: ${error.message}`);
  }

  return {
    messageId: data?.id,
    data,
  };
}

async function verifyEmailConnection() {
  // Resend does not use an SMTP connection. This checks that the
  // API key is configured; a real send is required to verify delivery.
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  return true;
}

module.exports = {
  sendEmail,
  verifyEmailConnection,
};