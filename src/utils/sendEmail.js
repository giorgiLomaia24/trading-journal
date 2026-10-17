const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// HTML-ში მომხმარებლის სახელი უსაფრთხოდ რომ ჩაჯდეს
const escapeHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

exports.sendPasswordResetEmail = async ({ to, name, resetUrl }) => {
  if (!resend) {
    throw new Error('RESEND_API_KEY არ არის დაყენებული .env-ში');
  }

  // დომენის ვერიფიკაციამდე Resend მხოლოდ onboarding@resend.dev-იდან და მხოლოდ შენს საკუთარ მეილზე გზავნის
  const from = process.env.EMAIL_FROM || 'Yonko <onboarding@resend.dev>';
  const safeName = escapeHtml(name || 'Trader');

  const html = `
  <div style="background:#0b0e11;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#181a20;border:1px solid #2b2f36;border-radius:16px;padding:32px;color:#eaecef;">
      <div style="font-size:18px;font-weight:700;color:#0ecb81;margin-bottom:20px;">⚡ Yonko</div>
      <h2 style="margin:0 0 12px;font-size:20px;color:#ffffff;">Reset your password</h2>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#b7bdc6;">
        Hi ${safeName}, we received a request to reset your password. Click the button below to choose a new one.
        This link is valid for <strong>1 hour</strong>.
      </p>
      <a href="${resetUrl}" style="display:inline-block;background:#0ecb81;color:#0b0e11;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;">
        Reset Password
      </a>
      <p style="margin:24px 0 6px;font-size:12px;color:#848e9c;">If the button doesn't work, copy this link into your browser:</p>
      <p style="margin:0;font-size:12px;word-break:break-all;color:#0ecb81;">${resetUrl}</p>
      <hr style="border:none;border-top:1px solid #2b2f36;margin:24px 0;" />
      <p style="margin:0;font-size:12px;color:#848e9c;">
        If you didn't request this, you can safely ignore this email. Your password won't change.
      </p>
    </div>
  </div>`;

  const text =
    `Hi ${name || 'Trader'},\n\n` +
    `We received a request to reset your password. Open this link to choose a new one (valid for 1 hour):\n\n` +
    `${resetUrl}\n\n` +
    `If you didn't request this, you can ignore this email.`;

  // Resend SDK შეცდომას არ აგდებს, აბრუნებს { data, error }
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: 'Reset your Yonko password',
    html,
    text
  });

  if (error) {
    throw new Error(error.message || 'Resend-მა მეილის გაგზავნა უარყო');
  }
  return data;
};