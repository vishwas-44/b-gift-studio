require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const { sendEmail, verifyEmailConnection } = require("../src/services/mailer");

async function main() {
  try {
    console.log("Checking SMTP connection...");

    await verifyEmailConnection();

    console.log("SMTP connection successful.");

    if (process.argv.includes("--send")) {
      const result = await sendEmail({
        to: process.env.SMTP_USER,
        subject: "Bhasi Gift Studio - Email Test",
        text: "Your Bhasi Gift Studio email service is working.",
        html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Bhasi Gift Studio</h2>
          <p>Your email service is working correctly.</p>
          <p>This is a test email, not an OTP.</p>
        </div>
      `,
      });

      console.log("Test email sent successfully.");
      console.log("Message ID:", result.messageId);
    } else {
      console.log("SMTP connection verified. Add --send to send a test email.");
    }
  } catch (error) {
    console.error("Email test failed:", error.message);
    process.exitCode = 1;
  }
}

main();
