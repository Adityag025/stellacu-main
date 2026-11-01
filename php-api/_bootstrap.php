<?php
/**
 * Shared setup for the PHP form API used on Hostinger shared hosting.
 *
 * The PHP endpoints mirror the Node.js functions in api/ (used on Vercel):
 * same URLs (/api/contact, /api/subscribe, /api/health via .htaccess), same
 * JSON responses and the same validation rules and messages.
 *
 * Success:  { "ok": true }
 * Failure:  { "ok": false, "error": "<code>", "fields": { "<field>": "<message>" } }
 */

declare(strict_types=1);

require __DIR__ . '/_config.php';
require __DIR__ . '/_validation.php';
require __DIR__ . '/_forms.php';
require __DIR__ . '/_email.php';
require __DIR__ . '/_ratelimit.php';
require __DIR__ . '/_db.php';

const MAX_BODY_BYTES = 20 * 1024;

/** An expected failure reported to the browser as JSON. */
final class HttpError extends Exception
{
    public function __construct(public readonly int $status, public readonly string $errorCode, public readonly ?array $fields = null)
    {
        parent::__construct($errorCode);
    }
}

function send_json(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

/** Returns the JSON request body as an array. */
function read_json_body(): array
{
    $declared = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($declared > MAX_BODY_BYTES) {
        throw new HttpError(413, 'payload_too_large');
    }
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
    if ($raw === false || strlen($raw) > MAX_BODY_BYTES) {
        throw new HttpError(413, 'payload_too_large');
    }
    if (trim($raw) === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new HttpError(400, 'invalid_json');
    }
    return $data;
}

/** Honeypot: real visitors never tick the hidden "botcheck" box. */
function is_bot(array $body): bool
{
    return !empty($body['botcheck']);
}

/** The page path the browser reports, e.g. "/landing-1". Only used as info in the email. */
function read_page_path(array $body): string
{
    $page = is_string($body['page'] ?? null) ? trim($body['page']) : '';
    return preg_match('~^/[\w\-./]{0,200}$~', $page) ? $page : '';
}

/**
 * Runs an endpoint: method check, then the handler; maps errors to JSON.
 *
 * @param string[] $methods Allowed HTTP methods.
 */
function run_endpoint(array $methods, callable $handle): void
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, $methods, true)) {
        header('Allow: ' . implode(', ', $methods));
        log_event('warning', 'method_not_allowed', $method);
        send_json(405, ['ok' => false, 'error' => 'method_not_allowed']);
        return;
    }
    try {
        $handle();
    } catch (HttpError $e) {
        // Wrong fields are everyday visitor mistakes (info); refusals are
        // warnings; anything the server could not do is an error.
        $level = $e->status >= 500 ? 'error' : ($e->errorCode === 'validation_failed' ? 'info' : 'warning');
        log_event($level, $e->errorCode, $e->fields ? 'fields: ' . implode(', ', array_keys($e->fields)) : '');
        $payload = ['ok' => false, 'error' => $e->errorCode];
        if ($e->fields) {
            $payload['fields'] = $e->fields;
        }
        send_json($e->status, $payload);
    } catch (Throwable $e) {
        log_event('error', 'internal_error', get_class($e) . ': ' . $e->getMessage());
        send_json(500, ['ok' => false, 'error' => 'internal_error']);
    }
}
