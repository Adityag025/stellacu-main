<?php
/**
 * Simple spam protection: at most rate_limit_max submissions per visitor
 * (IP address) per rate_limit_window_seconds. Counts are kept in small
 * files in the server's temp folder (IPs are stored only as hashes).
 */

declare(strict_types=1);

function client_ip(): string
{
    return (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

/** @throws HttpError 429 when the visitor has sent too many submissions recently. */
function enforce_rate_limit(array $config): void
{
    $max = (int) $config['rate_limit_max'];
    $window = (int) $config['rate_limit_window_seconds'];
    if ($max <= 0) {
        return;
    }
    $dir = sys_get_temp_dir() . '/stellacu-ratelimit';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        return; // never block real visitors because of a storage problem
    }
    $file = $dir . '/' . hash('sha256', client_ip()) . '.json';
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
