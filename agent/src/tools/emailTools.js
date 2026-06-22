const Imap = require('imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

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
        to: {
          type: 'string',
          description: 'Recipient email address'
        },
        subject: {
          type: 'string',
          description: 'Email subject line'
        },
        body: {
          type: 'string',
          description: 'Email body text'
        }
      },
      required: ['to', 'subject', 'body']
    }
  }
];

async function readEmails() {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: process.env.EMAIL_USER,
      password: process.env.EMAIL_PASS,
      host: process.env.EMAIL_HOST || 'imap.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '993'),
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });

    const emails = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err, box) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        const total = box.messages.total;
        if (total === 0) {
          imap.end();
          return resolve([]);
        }

        const start = Math.max(1, total - 9);
        const fetch = imap.seq.fetch(`${start}:${total}`, {
          bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT'],
          struct: true
        });

        const parsePromises = [];

        fetch.on('message', (msg) => {
          const chunks = [];
          let headerBuffer = '';

          msg.on('body', (stream, info) => {
            const buffers = [];
            stream.on('data', (chunk) => buffers.push(chunk));
            stream.on('end', () => {
              const content = Buffer.concat(buffers).toString('utf-8');
              if (info.which.includes('HEADER')) {
                headerBuffer = content;
              } else {
                chunks.push(content);
              }
            });
          });

          msg.once('end', () => {
            const combined = headerBuffer + '\r\n' + chunks.join('');
            const p = simpleParser(combined).then((parsed) => {
              emails.push({
                subject: parsed.subject || '(no subject)',
                from: parsed.from ? parsed.from.text : '(unknown)',
                date: parsed.date ? parsed.date.toISOString() : '(unknown)',
                snippet: (parsed.text || parsed.html || '').slice(0, 200).replace(/\s+/g, ' ').trim()
              });
            }).catch(() => {});
            parsePromises.push(p);
          });
        });

        fetch.once('error', (err) => {
          imap.end();
          reject(err);
        });

        fetch.once('end', () => {
          Promise.all(parsePromises).then(() => {
            imap.end();
          });
        });
      });
    });

    imap.once('end', () => {
      resolve(emails.reverse());
    });

    imap.once('error', (err) => {
      reject(err);
    });

    imap.connect();
  });
}

async function sendEmail({ to, subject, body }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const info = await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    text: body
  });

  return { messageId: info.messageId, status: 'sent' };
}

const handlers = {
  read_emails: async (_input) => readEmails(),
  send_email: async (input) => sendEmail(input)
};

module.exports = { tools, handlers };
