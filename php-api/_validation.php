<?php
/**
 * Field validation - same rules and messages as api/_lib/validation.js
 * (Node, Vercel) and the "Website Forms" section of js/app.js (browser).
 * Keep all three in sync.
 */

declare(strict_types=1);

const MESSAGE_REQUIRED = 'This field is required.';
const MESSAGE_CHOOSE = 'Please choose an option.';

function message_min_length(int $n): string
{
    return "Please enter at least {$n} characters.";
}

function message_max_length(int $n): string
{
    return "Please use {$n} characters or fewer.";
}

function collapse_spaces(string $v): string
{
    return preg_replace('/\s+/u', ' ', $v);
}

function to_name(string $v): ?string
{
    $name = collapse_spaces($v);
    // Letters in any language, joined by spaces, apostrophes, hyphens or dots.
    return preg_match("/^[\\p{L}\\p{M}]+(?:[\\s'’.-]+[\\p{L}\\p{M}]+)*\\.?$/u", $name) ? $name : null;
}

function to_email(string $v): ?string
{
    return preg_match('/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i', $v) && !str_contains($v, '..') ? strtolower($v) : null;
}

function to_phone(string $v): ?string
{
    if (!preg_match('/^\+?[\d\s().-]+$/', $v)) {
        return null;
    }
    $digits = strlen(preg_replace('/\D/', '', $v));
    return $digits >= 7 && $digits <= 15 ? collapse_spaces($v) : null;
}

function to_http_url(string $v): ?string
{
    $withScheme = preg_match('~^[a-z][a-z\d+.-]*://~i', $v) ? $v : "https://{$v}";
    $parts = parse_url($withScheme);
    if (!$parts || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)) {
        return null;
    }
    $host = strtolower($parts['host'] ?? '');
    // Public domains end in a letter TLD (".com", ".in") or an IDN one ("xn--...").
    if (!preg_match('/\.(?:[a-z]{2,}|xn--[a-z\d-]+)$/', $host) || !filter_var("http://{$host}", FILTER_VALIDATE_URL)) {
        return null;
    }
    $path = $parts['path'] ?? '/';
    $query = isset($parts['query']) ? '?' . $parts['query'] : '';
    return strtolower($parts['scheme']) . "://{$host}" . ($path === '' ? '/' : $path) . $query;
}

/** Each type: length limits, normaliser (returns null when invalid) and message. */
function field_types(): array
{
    return [
        'name' => ['min' => 2, 'max' => 100, 'normalise' => 'to_name', 'message' => 'Use letters only (spaces, apostrophes and hyphens are fine).'],
        'text' => ['min' => 2, 'max' => 200, 'normalise' => 'collapse_spaces', 'message' => ''],
        'longText' => ['min' => 10, 'max' => 5000, 'normalise' => null, 'message' => ''],
        'email' => ['min' => 0, 'max' => 254, 'normalise' => 'to_email', 'message' => 'Enter a valid email address.'],
        'phone' => ['min' => 0, 'max' => 30, 'normalise' => 'to_phone', 'message' => 'Enter a valid phone number (7 to 15 digits).'],
        'url' => ['min' => 0, 'max' => 500, 'normalise' => 'to_http_url', 'message' => 'Enter a valid website address, e.g. example.com.'],
        'choice' => ['min' => 0, 'max' => 100, 'normalise' => null, 'message' => 'Please choose one of the options.'],
    ];
}

/** @return array{value?: string, error?: string} */
function validate_field(array $field, mixed $raw): array
{
    $types = field_types();
    $type = $types[$field['type']] ?? null;
    if ($type === null) {
        throw new LogicException("Unknown field type {$field['type']}");
    }

    $value = is_string($raw) ? trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $raw)) : '';
    if ($value === '') {
        if (empty($field['required'])) {
            return ['value' => ''];
        }
        return ['error' => $field['type'] === 'choice' ? MESSAGE_CHOOSE : MESSAGE_REQUIRED];
    }

    $length = mb_strlen($value);
    if ($type['min'] && $length < $type['min']) {
        return ['error' => message_min_length($type['min'])];
    }
    if ($length > $type['max']) {
        return ['error' => message_max_length($type['max'])];
    }

    if ($field['type'] === 'choice') {
        return array_key_exists($value, $field['options']) ? ['value' => $value] : ['error' => $type['message']];
    }
    if ($type['normalise'] === null) {
        return ['value' => $value];
    }
    $cleaned = ($type['normalise'])($value);
    return $cleaned === null ? ['error' => $type['message']] : ['value' => $cleaned];
}

/** @return array{0: array, 1: array} [values, errors] */
function validate_fields(array $fields, mixed $input): array
{
    $source = is_array($input) ? $input : [];
    $values = [];
    $errors = [];
    foreach ($fields as $name => $field) {
        $result = validate_field($field, $source[$name] ?? null);
        if (isset($result['error'])) {
            $errors[$name] = $result['error'];
        } else {
            $values[$name] = $result['value'];
        }
    }
    return [$values, $errors];
}
