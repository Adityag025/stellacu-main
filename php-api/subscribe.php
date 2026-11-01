<?php
/**
 * POST /api/subscribe  (Hostinger: .htaccess routes it here)
 *
 * Footer newsletter. Adds the address to Mailchimp when configured,
 * otherwise emails it to the team inbox. Same format as api/subscribe.js:
 *   { "email": "...", "page": "/...", "botcheck": "" }
 */

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

run_endpoint(['POST'], static function (): void {
    $config = api_config();
    $body = read_json_body();

    if (is_bot($body)) {
        send_json(200, ['ok' => true]);
        return;
    }

    [$values, $errors] = validate_fields(['email' => ['label' => 'Email', 'type' => 'email', 'required' => true]], $body);
    if ($errors) {
        throw new HttpError(422, 'validation_failed', $errors);
    }

    if (!mailchimp_configured($config) && !mail_configured($config)) {
        error_log('[subscribe] not configured: create php-api/config.local.php');
        throw new HttpError(503, 'not_configured');
    }

    enforce_rate_limit($config);

    try {
        if (mailchimp_configured($config)) {
            mailchimp_add_subscriber($config, $values['email']);
        } else {
            send_team_email($config, $values['email'], build_subscriber_email($values['email'], read_page_path($body)));
        }
    } catch (MailError $e) {
        error_log('[subscribe] delivery failed: ' . $e->getMessage());
        throw new HttpError(502, 'delivery_failed');
    }

    send_json(200, ['ok' => true]);
});
