<?php
/**
 * Settings for the PHP form API.
 *
 * Real values live in config.local.php next to this file. That file is not
 * in git (see .gitignore) and is uploaded to the server separately; copy
 * config.example.php to create it. .htaccess blocks web access to it.
 */

declare(strict_types=1);

function api_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }
    $defaults = [
        // Hostinger mailbox that sends the notification emails.
        'smtp_host' => 'smtp.hostinger.com',
        'smtp_port' => 465, // SSL/TLS
        'smtp_user' => '',
        'smtp_pass' => '',
        // Sender name shown in the inbox; the address is smtp_user.
        'from_name' => 'StellAcu Website',
        // Inbox(es) that receive enquiries.
        'mail_to' => [],
        // Optional newsletter list; without it, signups are emailed to mail_to.
        'mailchimp_api_key' => '',
        'mailchimp_audience_id' => '',
        'mailchimp_double_opt_in' => true,
        // MySQL database for saving leads (hPanel → Databases → MySQL Databases).
        'db_host' => 'localhost',
        'db_name' => '',
        'db_user' => '',
        'db_pass' => '',
        // Private /leads page: password_hash() of its password (see config.example.php).
        'leads_password_hash' => '',
        // Spam protection: max form submissions per visitor (IP) per window.
        'rate_limit_max' => 5,
        'rate_limit_window_seconds' => 600,
    ];
    $local = is_file(__DIR__ . '/config.local.php') ? require __DIR__ . '/config.local.php' : [];
    $config = array_merge($defaults, is_array($local) ? $local : []);
    return $config;
}

function mail_configured(array $c): bool
{
    return $c['smtp_user'] !== '' && $c['smtp_pass'] !== '' && count($c['mail_to']) > 0;
}

function mailchimp_configured(array $c): bool
{
    return $c['mailchimp_api_key'] !== '' && $c['mailchimp_audience_id'] !== '';
}
