const { Resend } = require("resend");

let resend;

async function sendEmail({ to, subject, text, html }) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    throw new Error(
      "Email is in development mode. Configure RESEND_API_KEY and EMAIL_FROM to send emails.",
    );
  }
  resend ||= new Resend(process.env.RESEND_API_KEY);
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
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    throw new Error("RESEND_API_KEY and EMAIL_FROM must be configured.");
  }

  return true;
}

module.exports = {
  sendEmail,
  verifyEmailConnection,
};
