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
        log_event('warning', 'bot_blocked', 'form: ' . $body['form']);
        send_json(200, ['ok' => true]);
        return;
    }

    [$values, $errors] = validate_fields($form['fields'], $body['fields'] ?? null);
    if ($errors) {
        throw new HttpError(422, 'validation_failed', $errors);
    }

    if (!mail_configured($config) && !db_configured($config)) {
        throw new HttpError(503, 'not_configured');
    }

    enforce_rate_limit($config);

    // Save first, so the lead is kept even if the email fails.
    $page = read_page_path($body);
    $leadId = db_save_lead((string) $body['form'], $form, $values, $page);

    $emailed = false;
    if (mail_configured($config)) {
        try {
            send_team_email($config, $values['email'], build_enquiry_email($form, $values, $page));
            $emailed = true;
        } catch (MailError $e) {
            log_event('error', 'email_failed', 'lead #' . ($leadId ?? '-') . ': ' . $e->getMessage());
        }
    }
    db_set_status('leads', $leadId, $emailed);

    log_event('info', 'lead_received', sprintf(
        'form: %s, lead #%s, email: %s',
        $body['form'],
        $leadId ?? 'not saved',
        mail_configured($config) ? ($emailed ? 'sent' : 'failed') : 'off'
    ));

    // Success if the lead reached the team by email or is safely stored.
    if (!$emailed && $leadId === null) {
        throw new HttpError(502, 'delivery_failed');
    }
    send_json(200, ['ok' => true]);
});
