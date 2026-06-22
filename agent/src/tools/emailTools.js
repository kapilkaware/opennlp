'use strict';
const net = require('node:net');
const tls = require('node:tls');

const tools = [
  {
    name: 'read_emails',
    description: 'Read the last 10 emails from the INBOX. Returns subject, from, date, and a snippet of the body.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'send_email',
    description: 'Send an email to a recipient.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body text' }
      },
      required: ['to', 'subject', 'body']
    }
  }
];

// ─── SMTP client (pure Node.js) ───────────────────────────────────────────────

function smtpSend({ host, port, user, pass, from, to, subject, body }) {
  return new Promise((resolve, reject) => {
    const useImplicitTLS = port === 465;
    const b64 = (s) => Buffer.from(s).toString('base64');

    let socket;
    let buffer = '';
    let step = 0;
    let tlsUpgraded = false;

    function send(line) {
      // console.debug('SMTP >', line);
      socket.write(line + '\r\n');
    }

    function handleLine(line) {
      // console.debug('SMTP <', line);
      const code = parseInt(line.slice(0, 3), 10);

      switch (step) {
        case 0: // greeting
          if (code === 220) {
            step = 1;
            send(`EHLO ${host}`);
          } else {
            reject(new Error(`SMTP greeting failed: ${line}`));
          }
          break;

        case 1: // EHLO response (possibly multi-line)
          if (line.charAt(3) === '-') return; // continuation
          if (code === 250) {
            if (!useImplicitTLS && !tlsUpgraded) {
              step = 2;
              send('STARTTLS');
            } else {
              // Already on TLS — go straight to AUTH
              step = 4;
              send('AUTH LOGIN');
            }
          } else {
            reject(new Error(`EHLO failed: ${line}`));
          }
          break;

        case 2: // STARTTLS response
          if (code === 220) {
            step = 3;
            upgradeToTLS();
          } else {
            reject(new Error(`STARTTLS failed: ${line}`));
          }
          break;

        case 3: // re-EHLO after TLS upgrade
          if (line.charAt(3) === '-') return; // continuation
          if (code === 250) {
            step = 4;
            send('AUTH LOGIN');
          } else {
            reject(new Error(`EHLO after STARTTLS failed: ${line}`));
          }
          break;

        case 4: // AUTH LOGIN prompt: 334 VXNlcm5hbWU6
          if (code === 334) {
            step = 5;
            send(b64(user));
          } else {
            reject(new Error(`AUTH LOGIN failed: ${line}`));
          }
          break;

        case 5: // AUTH LOGIN password prompt: 334 UGFzc3dvcmQ6
          if (code === 334) {
            step = 6;
            send(b64(pass));
          } else {
            reject(new Error(`AUTH LOGIN username rejected: ${line}`));
          }
          break;

        case 6: // 235 auth successful
          if (code === 235) {
            step = 7;
            send(`MAIL FROM:<${from}>`);
          } else {
            reject(new Error(`AUTH failed: ${line}`));
          }
          break;

        case 7: // MAIL FROM
          if (code === 250) {
            step = 8;
            send(`RCPT TO:<${to}>`);
          } else {
            reject(new Error(`MAIL FROM failed: ${line}`));
          }
          break;

        case 8: // RCPT TO
          if (code === 250) {
            step = 9;
            send('DATA');
          } else {
            reject(new Error(`RCPT TO failed: ${line}`));
          }
          break;

        case 9: // DATA prompt: 354
          if (code === 354) {
            step = 10;
            const date = new Date().toUTCString();
            const msg = [
              `From: ${from}`,
              `To: ${to}`,
              `Subject: ${subject}`,
              `Date: ${date}`,
              `MIME-Version: 1.0`,
              `Content-Type: text/plain; charset=UTF-8`,
              '',
              body,
              '.'
            ].join('\r\n');
            send(msg);
          } else {
            reject(new Error(`DATA failed: ${line}`));
          }
          break;

        case 10: // 250 message accepted
          if (code === 250) {
            step = 11;
            send('QUIT');
          } else {
            reject(new Error(`Message not accepted: ${line}`));
          }
          break;

        case 11: // 221 bye
          socket.destroy();
          resolve({ status: 'sent', message: line });
          break;

        default:
          break;
      }
    }

    function onData(data) {
      buffer += data.toString();
      let idx;
      while ((idx = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        handleLine(line);
      }
    }

    function upgradeToTLS() {
      const plain = socket;
      socket = tls.connect({ socket: plain, host, servername: host, rejectUnauthorized: false }, () => {
        tlsUpgraded = true;
        socket.on('data', onData);
        // Re-issue EHLO over TLS
        step = 3;
        send(`EHLO ${host}`);
      });
      socket.on('error', reject);
    }

    if (useImplicitTLS) {
      socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
        tlsUpgraded = true;
        socket.on('data', onData);
      });
    } else {
      socket = net.connect({ host, port }, () => {
        socket.on('data', onData);
      });
    }

    socket.on('error', reject);
    socket.setTimeout(15000, () => {
      socket.destroy();
      reject(new Error('SMTP connection timed out'));
    });
  });
}

// ─── Tool handlers ─────────────────────────────────────────────────────────────

async function readEmails() {
  return {
    status: 'unavailable',
    message:
      'Reading emails via IMAP requires the `imap` and `mailparser` npm packages, which are not currently installed. ' +
      'To enable this feature, run: npm install imap mailparser\n' +
      'Then update src/tools/emailTools.js to use those packages. ' +
      'Sending email is fully functional via SMTP.'
  };
}

async function sendEmail({ to, subject, body }) {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);

  if (!user || !pass) {
    return { error: 'EMAIL_USER and EMAIL_PASS environment variables are required to send email.' };
  }

  await smtpSend({ host, port, user, pass, from: user, to, subject, body });
  return { status: 'sent', to, subject };
}

const handlers = {
  read_emails: async (_input) => readEmails(),
  send_email: async (input) => sendEmail(input)
};

module.exports = { tools, handlers };
