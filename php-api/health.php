<?php
/**
 * GET /api/health  (Hostinger: .htaccess routes it here)
 * Reports only whether integrations are set up, never their values.
 *   { "ok": true, "email": true|false, "newsletter": "mailchimp" | "email" | "none", "backend": "php" }
 */

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

run_endpoint(['GET'], static function (): void {
    $config = api_config();
    $email = mail_configured($config);
    $newsletter = mailchimp_configured($config) ? 'mailchimp' : ($email ? 'email' : 'none');
    send_json(200, ['ok' => true, 'email' => $email, 'newsletter' => $newsletter, 'backend' => 'php']);
});
