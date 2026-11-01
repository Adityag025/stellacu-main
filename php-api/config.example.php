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

    // MySQL database that stores every lead (hPanel → Databases → MySQL Databases).
    'db_host' => 'localhost',
    'db_name' => '',
    'db_user' => '',
    'db_pass' => '',

    // Password for the private /leads page, stored as a hash. Create one with:
    //   php -r "echo password_hash('your-password', PASSWORD_DEFAULT);"
    'leads_password_hash' => '',

    // Optional: Mailchimp list for the footer newsletter.
    // 'mailchimp_api_key' => '',
    // 'mailchimp_audience_id' => '',
];
