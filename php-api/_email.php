<?php
/**
 * Notification emails (same content as api/_lib/email-templates.js) and a
 * small SMTP client that sends them through Hostinger's mail server over
 * SSL/TLS (port 465) with the mailbox from config.local.php.
 */

declare(strict_types=1);

final class MailError extends Exception
{
}

function format_received(): string
{
    return gmdate('Y-m-d H:i:s') . ' UTC';
}

function render_text(string $title, array $rows): string
{
    $lines = [$title, ''];
    foreach ($rows as [$label, $value]) {
        $lines[] = "{$label}: {$value}";
    }
    return implode("\n", $lines);
}

function render_html(string $title, array $rows): string
{
    $e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $body = '';
    foreach ($rows as [$label, $value]) {
        $body .= '<tr><td style="padding:6px 16px 6px 0;color:#666;vertical-align:top;white-space:nowrap">' . $e($label) . '</td>'
            . '<td style="padding:6px 0;white-space:pre-wrap">' . $e($value) . '</td></tr>';
    }
    return '<div style="font-family:Arial,sans-serif;font-size:14px;color:#161616">'
        . '<h2 style="font-size:18px;margin:0 0 16px">' . $e($title) . '</h2>'
        . '<table style="border-collapse:collapse">' . $body . '</table></div>';
}

/** @return array{subject: string, text: string, html: string} */
function build_enquiry_email(array $form, array $values, string $page): array
{
    $rows = [];
    foreach ($form['fields'] as $name => $field) {
        if (($values[$name] ?? '') === '') {
            continue;
        }
        $value = $field['type'] === 'choice' ? ($field['options'][$values[$name]] ?? $values[$name]) : $values[$name];
        $rows[] = [$field['label'], $value];
    }
    if ($page !== '') {
        $rows[] = ['Page', $page];
    }
    $rows[] = ['Received', format_received()];
    return ['subject' => $form['subject'], 'text' => render_text($form['subject'], $rows), 'html' => render_html($form['subject'], $rows)];
}

/** @return array{subject: string, text: string, html: string} */
function build_subscriber_email(string $email, string $page): array
{
    $subject = 'New newsletter signup';
    $rows = [['Email', $email]];
    if ($page !== '') {
        $rows[] = ['Page', $page];
    }
    $rows[] = ['Received', format_received()];
    return ['subject' => $subject, 'text' => render_text($subject, $rows), 'html' => render_html($subject, $rows)];
}

/** RFC 2047 encoding for header text that may contain non-ASCII characters. */
function encode_header(string $text): string
{
    return preg_match('/[^\x20-\x7E]/', $text) ? '=?UTF-8?B?' . base64_encode($text) . '?=' : $text;
}

/** Builds the full MIME message: text + HTML alternatives, both base64 (safe line lengths, no dot issues). */
function build_mime(string $fromName, string $from, array $to, string $replyTo, array $email): string
{
    $boundary = 'b' . bin2hex(random_bytes(12));
    $domain = substr(strrchr($from, '@'), 1) ?: 'localhost';
    $headers = [
        'Date: ' . date(DATE_RFC2822),
        'From: ' . encode_header($fromName) . " <{$from}>",
        'To: ' . implode(', ', $to),
        'Subject: ' . encode_header($email['subject']),
        'Message-ID: <' . bin2hex(random_bytes(16)) . "@{$domain}>",
        'MIME-Version: 1.0',
        "Content-Type: multipart/alternative; boundary=\"{$boundary}\"",
    ];
    if ($replyTo !== '') {
        $headers[] = "Reply-To: {$replyTo}";
    }
    $part = static fn (string $type, string $content): string => "--{$boundary}\r\n"
        . "Content-Type: {$type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . rtrim(chunk_split(base64_encode($content), 76, "\r\n")) . "\r\n";
    return implode("\r\n", $headers) . "\r\n\r\n"
        . $part('text/plain', $email['text'])
        . $part('text/html', $email['html'])
        . "--{$boundary}--\r\n";
}

/**
 * Sends one email over SMTPS (implicit TLS) with AUTH LOGIN.
 * Addresses are validated before they get here (to_email), so they cannot
 * carry line breaks into the SMTP commands.
 *
 * @throws MailError when the server refuses or the connection fails.
 */
function smtp_send(array $config, array $to, string $replyTo, array $email): void
{
    $from = $config['smtp_user'];
    $socket = @stream_socket_client(
        "ssl://{$config['smtp_host']}:{$config['smtp_port']}",
        $errno,
        $errstr,
        20,
        STREAM_CLIENT_CONNECT,
        stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $config['smtp_host']]])
    );
    if (!$socket) {
        throw new MailError("connect failed: {$errstr} ({$errno})");
    }
    stream_set_timeout($socket, 20);

    $expect = static function (array $codes) use ($socket): string {
        $reply = '';
        while (($line = fgets($socket, 1024)) !== false) {
            $reply .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') {
                break; // last line of a (possibly multi-line) reply
            }
        }
        $code = (int) substr($reply, 0, 3);
        if (!in_array($code, $codes, true)) {
            throw new MailError('unexpected SMTP reply: ' . trim($reply));
        }
        return $reply;
    };
    $command = static function (string $line, array $codes) use ($socket, $expect): string {
        fwrite($socket, $line . "\r\n");
        return $expect($codes);
    };

    try {
        $expect([220]);
        $command('EHLO ' . (gethostname() ?: 'localhost'), [250]);
        $command('AUTH LOGIN', [334]);
        $command(base64_encode($config['smtp_user']), [334]);
        $command(base64_encode($config['smtp_pass']), [235]);
        $command("MAIL FROM:<{$from}>", [250]);
        foreach ($to as $rcpt) {
            $command("RCPT TO:<{$rcpt}>", [250, 251]);
        }
        $command('DATA', [354]);
        fwrite($socket, build_mime($config['from_name'], $from, $to, $replyTo, $email) . "\r\n.\r\n");
        $expect([250]);
        $command('QUIT', [221]);
    } finally {
        fclose($socket);
    }
}

/** Sends an email to the team inbox(es) from the configured mailbox. */
function send_team_email(array $config, string $replyTo, array $email): void
{
    smtp_send($config, $config['mail_to'], $replyTo, $email);
}

/** Adds a subscriber to Mailchimp (PUT on the member hash, so re-subscribing is fine). */
function mailchimp_add_subscriber(array $config, string $email): void
{
    $parts = explode('-', $config['mailchimp_api_key']);
    $dc = end($parts);
    if (!preg_match('/^[a-z]+\d+$/', $dc)) {
        throw new MailError('Mailchimp API key has no data-centre suffix');
    }
    $url = "https://{$dc}.api.mailchimp.com/3.0/lists/" . rawurlencode($config['mailchimp_audience_id']) . '/members/' . md5(strtolower($email));
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => 'PUT',
        CURLOPT_USERPWD => 'stellacu:' . $config['mailchimp_api_key'],
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode(['email_address' => $email, 'status_if_new' => $config['mailchimp_double_opt_in'] ? 'pending' : 'subscribed']),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
    ]);
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($status < 200 || $status >= 300) {
        throw new MailError("Mailchimp request failed ({$status}): " . substr((string) $response, 0, 300));
    }
}
