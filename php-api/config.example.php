<?php
/**
 * Copy this file to config.local.php (same folder) and fill in the values.
 * config.local.php is git-ignored and must only exist on the server.
 */
return [
    // Hostinger mailbox used to send (hPanel → Emails). Its address is also the sender.
    'smtp_user' => 'sales@stellacumedia.com',
    'smtp_pass' => '',
    'from_name' => 'StellAcu Website',
    // Where enquiries are delivered.
    'mail_to' => ['sales@stellacumedia.com'],

    // Optional: Mailchimp list for the footer newsletter.
    // 'mailchimp_api_key' => '',
    // 'mailchimp_audience_id' => '',
];
