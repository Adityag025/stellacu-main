<?php
/**
 * POST /api/contact  (Hostinger: .htaccess routes it here)
 *
 * Growth Audit and landing page forms; emails each enquiry to the team
 * inbox with the visitor as Reply-To. Same request/response format as
 * api/contact.js:
 *   { "form": "growth-audit" | "landing-1" | "landing-2", "fields": {...}, "page": "/...", "botcheck": "" }
 * Responses: 200 ok · 400 unknown_form/invalid_json · 413 · 422 validation_failed
 *            · 429 too_many_requests · 502 delivery_failed · 503 not_configured
 */

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

run_endpoint(['POST'], static function (): void {
    $config = api_config();
    $body = read_json_body();

    $form = get_form($body['form'] ?? null);
    if ($form === null) {
        throw new HttpError(400, 'unknown_form');
    }

    // Bots get a normal success reply so they don't retry; nothing is sent.
    if (is_bot($body)) {
        send_json(200, ['ok' => true]);
        return;
    }

    [$values, $errors] = validate_fields($form['fields'], $body['fields'] ?? null);
    if ($errors) {
        throw new HttpError(422, 'validation_failed', $errors);
    }

    if (!mail_configured($config)) {
        error_log('[contact] email is not configured: create php-api/config.local.php');
        throw new HttpError(503, 'not_configured');
    }

    enforce_rate_limit($config);

    try {
        send_team_email($config, $values['email'], build_enquiry_email($form, $values, read_page_path($body)));
    } catch (MailError $e) {
        error_log('[contact] delivery failed: ' . $e->getMessage());
        throw new HttpError(502, 'delivery_failed');
    }

    send_json(200, ['ok' => true]);
});
