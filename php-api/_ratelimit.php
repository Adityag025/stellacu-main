<?php
/**
 * Simple spam protection: at most rate_limit_max submissions per visitor
 * (IP address) per rate_limit_window_seconds. Counts are kept in small
 * files in the server's temp folder (IPs are stored only as hashes).
 */

declare(strict_types=1);

/**
 * The visitor's IP. The site is behind Hostinger's CDN, so REMOTE_ADDR can
 * be a CDN server shared by many visitors; the CDN appends the real visitor
 * address as the last X-Forwarded-For entry.
 */
function client_ip(): string
{
    $forwarded = (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
    if ($forwarded !== '') {
        $parts = array_map('trim', explode(',', $forwarded));
        $last = end($parts);
        if (filter_var($last, FILTER_VALIDATE_IP)) {
            return $last;
        }
    }
    return (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

/**
 * @param string $bucket Separate counters per purpose, e.g. "forms" or "leads-login".
 * @throws HttpError 429 when the visitor has made too many attempts recently.
 */
function enforce_rate_limit(array $config, string $bucket = 'forms', ?int $max = null, ?int $window = null): void
{
    $max ??= (int) $config['rate_limit_max'];
    $window ??= (int) $config['rate_limit_window_seconds'];
    if ($max <= 0) {
        return;
    }
    $dir = sys_get_temp_dir() . '/stellacu-ratelimit';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        return; // never block real visitors because of a storage problem
    }
    $file = $dir . '/' . hash('sha256', $bucket . '|' . client_ip()) . '.json';
    $now = time();

    $handle = @fopen($file, 'c+');
    if (!$handle) {
        return;
    }
    try {
        flock($handle, LOCK_EX);
        $times = json_decode((string) stream_get_contents($handle), true);
        $times = array_values(array_filter(is_array($times) ? $times : [], static fn ($t) => is_int($t) && $t > $now - $window));
        if (count($times) >= $max) {
            throw new HttpError(429, 'too_many_requests');
        }
        $times[] = $now;
        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, json_encode($times));
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}
