require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const { sendEmail } = require("../src/services/mailer");

async function main() {
  try {
    if (!process.argv.includes("--send")) {
      console.log("Mailer configuration loaded.");
      console.log("Add --send to send a test email.");
      return;
    }

    const to = process.env.EMAIL_TEST_TO;

    if (!to) {
      throw new Error("Set EMAIL_TEST_TO in backend/.env before sending.");
    }

    const result = await sendEmail({
      to,
      subject: "Bhasi Gift Studio - Email Test",
      text: "Your Bhasi Gift Studio email service is working.",
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Bhasi Gift Studio</h2>
          <p>Your email service is working through Resend.</p>
          <p>This is a test email, not an OTP.</p>
        </div>
      `,
    });

    console.log("Test email accepted by Resend.");
    console.log("Message ID:", result.messageId || "(not returned)");
  } catch (error) {
    console.error("Email test failed:", error.message);
    process.exitCode = 1;
  }
}

main();
