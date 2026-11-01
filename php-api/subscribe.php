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
        log_event('warning', 'bot_blocked', 'newsletter');
        send_json(200, ['ok' => true]);
        return;
    }

    [$values, $errors] = validate_fields(['email' => ['label' => 'Email', 'type' => 'email', 'required' => true]], $body);
    if ($errors) {
        throw new HttpError(422, 'validation_failed', $errors);
    }

    if (!mailchimp_configured($config) && !mail_configured($config) && !db_configured($config)) {
        throw new HttpError(503, 'not_configured');
    }

    enforce_rate_limit($config);

    // Save first, so the signup is kept even if Mailchimp/email fails.
    $page = read_page_path($body);
    $subscriberId = db_save_subscriber($values['email'], $page);

    $delivered = false;
    try {
        if (mailchimp_configured($config)) {
            mailchimp_add_subscriber($config, $values['email']);
            $delivered = true;
        } elseif (mail_configured($config)) {
            send_team_email($config, $values['email'], build_subscriber_email($values['email'], $page));
            $delivered = true;
        }
    } catch (MailError $e) {
        log_event('error', 'newsletter_delivery_failed', 'subscriber #' . ($subscriberId ?? '-') . ': ' . $e->getMessage());
    }
    db_set_status('subscribers', $subscriberId, $delivered);

    log_event('info', 'newsletter_signup', sprintf('subscriber #%s, delivered: %s', $subscriberId ?? 'not saved', $delivered ? 'yes' : 'no'));

    if (!$delivered && $subscriberId === null) {
        throw new HttpError(502, 'delivery_failed');
    }
    send_json(200, ['ok' => true]);
});
