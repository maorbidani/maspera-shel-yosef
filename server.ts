import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT =
  process.env.NODE_ENV === 'production' ? Number(process.env.PORT) || 3000 : 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

interface DispatchLog {
  appointmentId: string;
  customerName: string;
  customerPhone: string;
  appointmentDate: string;
  startTime: string;
  sentAt: string;
  method: 'auto_webhook' | 'manual_whatsapp';
}

interface ReminderState {
  autoEnabled: boolean;
  sendHour: string;
  template: string;
  lastRunAt: string | null;
  lastRunSummary: string | null;
  sentIds: Set<string>;
  logs: DispatchLog[];
}

const reminderState: ReminderState = {
  autoEnabled: true,
  sendHour: '18:00',
  template: 'שלום {name}, תזכורת לתור שלך מחר ב{shop} בשעה {time}. נתראה!',
  lastRunAt: null,
  lastRunSummary: null,
  sentIds: new Set<string>(),
  logs: [],
};

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function getServerSupabase(): SupabaseClient | null {
  const url = (process.env.VITE_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key || !url.startsWith('http')) {
    return null;
  }
  return createClient(url, key);
}

function getIsraelNowParts(): { dateStr: string; tomorrowStr: string; hhmm: string } {
  const now = new Date();
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const dateStr = dateFmt.format(now);
  const [y, m, d] = dateStr.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const hhmm = timeFmt.format(now);
  return { dateStr, tomorrowStr, hhmm };
}

function formatIsraeliPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return `+${digits}`;
  if (digits.startsWith('0')) return `+972${digits.slice(1)}`;
  return `+972${digits}`;
}

function isAllowedWebhookUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host === '169.254.169.254' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function signAdminToken(): string {
  const payload = Buffer.from(
    JSON.stringify({ role: 'barber_admin', exp: Date.now() + TOKEN_TTL_MS })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAdminToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  if (!payload || !sig) return false;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      role?: string;
      exp?: number;
    };
    return decoded.role === 'barber_admin' && typeof decoded.exp === 'number' && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !verifyAdminToken(token)) {
    res.status(401).json({ error: 'נדרשת הזדהות כספר' });
    return;
  }
  next();
}

async function runAutomaticReminderCycle(manualTrigger: boolean): Promise<{
  ok: boolean;
  sentCount: number;
  pendingCount: number;
  gatewayConfigured: boolean;
  summary: string;
}> {
  const webhookUrl = (process.env.WHATSAPP_WEBHOOK_URL || '').trim();
  const webhookToken = (process.env.WHATSAPP_WEBHOOK_TOKEN || '').trim();
  const gatewayConfigured = Boolean(webhookUrl) && isAllowedWebhookUrl(webhookUrl);
  const supabase = getServerSupabase();

  if (!supabase) {
    const summary = 'חיבור Supabase בשרת לא מוגדר';
    reminderState.lastRunAt = new Date().toISOString();
    reminderState.lastRunSummary = summary;
    return { ok: false, sentCount: 0, pendingCount: 0, gatewayConfigured, summary };
  }

  const { tomorrowStr } = getIsraelNowParts();
  const { data: settingsRow } = await supabase
    .from('barbershop_settings')
    .select('shop_name')
    .eq('id', 1)
    .maybeSingle();

  const shopName = settingsRow?.shop_name || 'המספרה של יוסף';

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('id, appointment_date, start_time, customer_name, customer_phone, status')
    .eq('appointment_date', tomorrowStr)
    .eq('status', 'booked')
    .order('start_time', { ascending: true });

  if (error) {
    const summary = `שגיאה בשליפת תורים למחר: ${error.message}`;
    reminderState.lastRunAt = new Date().toISOString();
    reminderState.lastRunSummary = summary;
    return { ok: false, sentCount: 0, pendingCount: 0, gatewayConfigured, summary };
  }

  const pending = (appointments || []).filter((apt) => !reminderState.sentIds.has(apt.id));

  if (!gatewayConfigured) {
    const summary =
      pending.length === 0
        ? 'אין תורים ממתינים לתזכורת למחר'
        : `נמצאו ${pending.length} תורים למחר. להפעלת שליחה אוטומטית מלאה יש להגדיר WHATSAPP_WEBHOOK_URL בשרת, או לשלוח בלחיצה דרך WhatsApp למטה.`;
    if (manualTrigger) {
      reminderState.lastRunAt = new Date().toISOString();
      reminderState.lastRunSummary = summary;
    }
    return {
      ok: true,
      sentCount: 0,
      pendingCount: pending.length,
      gatewayConfigured: false,
      summary,
    };
  }

  let sentCount = 0;
  for (const apt of pending) {
    const timeShort = String(apt.start_time || '').slice(0, 5);
    const message = reminderState.template
      .replaceAll('{name}', apt.customer_name)
      .replaceAll('{shop}', shopName)
      .replaceAll('{time}', timeShort)
      .replaceAll('{date}', apt.appointment_date);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (webhookToken) {
        headers.Authorization = `Bearer ${webhookToken}`;
      }

      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: formatIsraeliPhoneE164(apt.customer_phone),
          customer_name: apt.customer_name,
          appointment_date: apt.appointment_date,
          start_time: timeShort,
          shop_name: shopName,
          message,
        }),
      });

      if (resp.ok) {
        reminderState.sentIds.add(apt.id);
        reminderState.logs.unshift({
          appointmentId: apt.id,
          customerName: apt.customer_name,
          customerPhone: apt.customer_phone,
          appointmentDate: apt.appointment_date,
          startTime: timeShort,
          sentAt: new Date().toISOString(),
          method: 'auto_webhook',
        });
        reminderState.logs = reminderState.logs.slice(0, 50);
        sentCount += 1;
      }
    } catch {
      // Continue remaining appointments if a single dispatch fails
    }
  }

  const summary =
    sentCount > 0
      ? `נשלחו ${sentCount} תזכורות WhatsApp אוטומטיות לתורי מחר`
      : pending.length === 0
      ? 'כל לקוחות מחר כבר קיבלו תזכורת'
      : 'השליחה האוטומטית הושלמה ללא נמענים חדשים';

  reminderState.lastRunAt = new Date().toISOString();
  reminderState.lastRunSummary = summary;

  return {
    ok: true,
    sentCount,
    pendingCount: Math.max(0, pending.length - sentCount),
    gatewayConfigured: true,
    summary,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.post('/api/admin/login', (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const record = loginAttempts.get(ip);
    if (record && record.resetAt > now && record.count >= 15) {
      res.status(429).json({ error: 'יותר מדי ניסיונות שגויים. נסה שוב בעוד מספר דקות.' });
      return;
    }

    const submittedPin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    const expectedPin = (process.env.BARBER_ADMIN_PIN || '').trim() || '1234';

    const submittedDigest = crypto.createHash('sha256').update(submittedPin).digest();
    const expectedDigest = crypto.createHash('sha256').update(expectedPin).digest();
    const valid = crypto.timingSafeEqual(submittedDigest, expectedDigest);

    if (!valid) {
      const nextCount = record && record.resetAt > now ? record.count + 1 : 1;
      loginAttempts.set(ip, { count: nextCount, resetAt: now + 5 * 60 * 1000 });
      res.status(401).json({ error: 'קוד PIN שגוי' });
      return;
    }

    loginAttempts.delete(ip);
    const token = signAdminToken();
    res.json({ token });
  });

  app.get('/api/admin/verify', requireAdmin, (_req: Request, res: Response) => {
    res.json({ valid: true });
  });

  app.get('/api/admin/reminders/status', requireAdmin, (_req: Request, res: Response) => {
    const webhookUrl = (process.env.WHATSAPP_WEBHOOK_URL || '').trim();
    const gatewayConfigured = Boolean(webhookUrl) && isAllowedWebhookUrl(webhookUrl);
    const supabaseConfigured = Boolean(getServerSupabase());

    res.json({
      gatewayConfigured,
      supabaseConfigured,
      autoEnabled: reminderState.autoEnabled,
      sendHour: reminderState.sendHour,
      template: reminderState.template,
      lastRunAt: reminderState.lastRunAt,
      lastRunSummary: reminderState.lastRunSummary,
      sentIds: Array.from(reminderState.sentIds),
      logs: reminderState.logs,
    });
  });

  app.post('/api/admin/reminders/settings', requireAdmin, (req: Request, res: Response) => {
    const { autoEnabled, sendHour, template } = req.body ?? {};
    if (typeof autoEnabled === 'boolean') {
      reminderState.autoEnabled = autoEnabled;
    }
    if (typeof sendHour === 'string' && /^\d{2}:\d{2}$/.test(sendHour)) {
      reminderState.sendHour = sendHour;
    }
    if (typeof template === 'string' && template.trim().length > 0 && template.length <= 500) {
      reminderState.template = template.trim();
    }
    res.json({
      autoEnabled: reminderState.autoEnabled,
      sendHour: reminderState.sendHour,
      template: reminderState.template,
    });
  });

  app.post('/api/admin/reminders/mark-sent', requireAdmin, (req: Request, res: Response) => {
    const { appointmentId, customerName, customerPhone, appointmentDate, startTime } = req.body ?? {};
    if (typeof appointmentId !== 'string' || !appointmentId.trim()) {
      res.status(400).json({ error: 'מזהה תור חסר' });
      return;
    }

    if (!reminderState.sentIds.has(appointmentId)) {
      reminderState.sentIds.add(appointmentId);
      reminderState.logs.unshift({
        appointmentId,
        customerName: typeof customerName === 'string' ? customerName : '',
        customerPhone: typeof customerPhone === 'string' ? customerPhone : '',
        appointmentDate: typeof appointmentDate === 'string' ? appointmentDate : '',
        startTime: typeof startTime === 'string' ? startTime.slice(0, 5) : '',
        sentAt: new Date().toISOString(),
        method: 'manual_whatsapp',
      });
      reminderState.logs = reminderState.logs.slice(0, 50);
    }

    res.json({ sentIds: Array.from(reminderState.sentIds), logs: reminderState.logs });
  });

  app.post('/api/admin/reminders/run', requireAdmin, async (_req: Request, res: Response) => {
    const result = await runAutomaticReminderCycle(true);
    res.json({
      ...result,
      sentIds: Array.from(reminderState.sentIds),
      logs: reminderState.logs,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  // Background automated scheduler for day-before WhatsApp reminders (checks every 5 minutes)
  setInterval(() => {
    if (!reminderState.autoEnabled) return;
    const { hhmm } = getIsraelNowParts();
    if (hhmm >= reminderState.sendHour) {
      void runAutomaticReminderCycle(false);
    }
  }, 5 * 60 * 1000);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
