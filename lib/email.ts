export interface TransactionalEmail {
  to: string;
  subject: string;
  textBody: string;
  tag?: string;
}

export async function sendTransactionalEmail(message: TransactionalEmail) {
  if (!process.env.POSTMARK_SERVER_TOKEN) {
    return {
      provider: "local",
      queued: true,
      message
    };
  }

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-postmark-server-token": process.env.POSTMARK_SERVER_TOKEN
    },
    body: JSON.stringify({
      From: process.env.POSTMARK_FROM_EMAIL ?? "transactions@getthe.com",
      To: message.to,
      Subject: message.subject,
      TextBody: message.textBody,
      Tag: message.tag
    })
  });

  if (!response.ok) {
    throw new Error(`Postmark email failed: ${response.status}`);
  }

  return response.json();
}
