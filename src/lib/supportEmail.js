import nodemailer from 'nodemailer';
import { Resend } from 'resend';

export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'contactyzero.dev@gmail.com';
const FROM_ADDRESS = process.env.SMTP_FROM || process.env.GMAIL_USER || SUPPORT_EMAIL;

const MAX_ATTEMPTS = 3;
const ATTEMPT_DELAY_MS = 5_000;
const SEND_TIMEOUT_MS = 30_000;

let transporter = null;
let _lastMailError = null;

function getTransporter() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASSWORD;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;

  if (smtpHost && smtpUser && smtpPass) {
    if (!transporter) {
      console.log('[mail] usando transporte SMTP:', `${smtpHost}:${smtpPort} (secure=${smtpSecure})`);
      transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
        connectionTimeout: 30_000,
        greetingTimeout: 30_000,
        socketTimeout: 30_000
      });
    }
    return transporter;
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.warn('SMTP nao configurado: GMAIL_USER/GMAIL_APP_PASSWORD ausentes no ambiente — e-mail de suporte nao sera enviado.');
    return null; 
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user, pass },
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 30_000
    });
  }
  return transporter;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendSupportMail({ name, email, topic, message }) {
  const mail = {
    from: `"NexChat Support" <${FROM_ADDRESS}>`,
    to: SUPPORT_EMAIL,
    replyTo: email,
    subject: `[NexChat Support] ${topic} — ${name}`,
    text: `Nome: ${name}\nE-mail: ${email}\nAssunto: ${topic}\n\n${message}`
  };

  return sendNexchatMail(mail);
}

export function getLastMailError() {
  return _lastMailError;
}

let _resend = null;
function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

async function sendViaSmtp({ to, subject, text, html }) {
  const mail = {
    from: `"NexChat" <${FROM_ADDRESS}>`,
    to,
    subject,
    text,
    html
  };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const tx = getTransporter();
    if (!tx) return false;
    try {
      const timeout = new Promise((resolve) => setTimeout(() => resolve(false), SEND_TIMEOUT_MS));
      const result = await Promise.race([tx.sendMail(mail), timeout]);
      if (result !== false) return true;
      _lastMailError = 'timeout (SMTP não respondeu em 30s)';
      console.error(`Envio de e-mail excedeu ${SEND_TIMEOUT_MS / 1000}s (tentativa ${attempt}/${MAX_ATTEMPTS}): ${subject}`);
    } catch (e) {
      _lastMailError = e.message;
      console.error(`Erro ao enviar e-mail (tentativa ${attempt}/${MAX_ATTEMPTS}):`, e.message);
    }
    if (attempt < MAX_ATTEMPTS) {
      transporter = null; 
      await sleep(ATTEMPT_DELAY_MS);
    }
  }
  return false;
}

export async function sendNexchatMail({ to, subject, text, html }) {
  if (!to) return false;
  _lastMailError = null;

  const resend = getResend();
  if (resend) {
    try {
      const { error } = await resend.emails.send({
        from: process.env.RESEND_FROM || 'NexChat <onboarding@resend.dev>',
        to: [to],
        subject,
        text,
        html: html || text
      });
      if (!error) return true;
      _lastMailError = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
      console.error('Resend falhou, tentando fallback SMTP:', _lastMailError);
    } catch (e) {
      _lastMailError = e.message;
      console.error('Erro ao enviar via Resend, tentando fallback SMTP:', e.message);
    }
  }

  return sendViaSmtp({ to, subject, text, html });
}