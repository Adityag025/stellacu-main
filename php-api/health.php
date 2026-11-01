<?php
/**
 * GET /api/health  (Hostinger: .htaccess routes it here)
 * Reports only whether integrations are set up, never their values.
 *   { "ok": true, "email": true|false, "newsletter": "mailchimp" | "email" | "none", "database": true|false, "backend": "php" }
 */

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

run_endpoint(['GET'], static function (): void {
    $config = api_config();
    $email = mail_configured($config);
    $newsletter = mailchimp_configured($config) ? 'mailchimp' : ($email ? 'email' : 'none');
    // Database: configured and reachable (never shows details).
    $database = false;
    if (db_configured($config)) {
        try {
            db()->query('SELECT 1');
            $database = true;
        } catch (Throwable $e) {
            error_log('[health] database unreachable: ' . $e->getMessage());
        }
    }
    send_json(200, ['ok' => true, 'email' => $email, 'newsletter' => $newsletter, 'database' => $database, 'backend' => 'php']);
});
