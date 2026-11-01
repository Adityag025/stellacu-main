<?php
/**
 * Lead storage in the Hostinger MySQL database.
 *
 * Every enquiry and newsletter signup is saved here before the email is
 * sent, so a lead is never lost if an email fails. The tables are created
 * automatically on first use. View them on the private /leads page or in
 * hPanel → Databases → phpMyAdmin.
 */

declare(strict_types=1);

function db_configured(array $c): bool
{
    return $c['db_name'] !== '' && $c['db_user'] !== '' && $c['db_pass'] !== '';
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $c = api_config();
    $pdo = new PDO(
        "mysql:host={$c['db_host']};dbname={$c['db_name']};charset=utf8mb4",
        $c['db_user'],
        $c['db_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]
    );
    db_ensure_schema($pdo);
    return $pdo;
}

function db_ensure_schema(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS leads (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME NOT NULL,
            form VARCHAR(32) NOT NULL,
            name VARCHAR(100) NOT NULL DEFAULT '',
            email VARCHAR(254) NOT NULL DEFAULT '',
            phone VARCHAR(30) NOT NULL DEFAULT '',
            company VARCHAR(200) NOT NULL DEFAULT '',
            website VARCHAR(500) NOT NULL DEFAULT '',
            budget VARCHAR(100) NOT NULL DEFAULT '',
            message TEXT NULL,
            page VARCHAR(200) NOT NULL DEFAULT '',
            email_status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
            INDEX idx_created (created_at),
            INDEX idx_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS subscribers (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME NOT NULL,
            email VARCHAR(254) NOT NULL,
            page VARCHAR(200) NOT NULL DEFAULT '',
            delivery_status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
            UNIQUE KEY uniq_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS activity_log (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME NOT NULL,
            level ENUM('info','warning','error') NOT NULL,
            event VARCHAR(50) NOT NULL,
            source VARCHAR(30) NOT NULL DEFAULT '',
            detail VARCHAR(500) NOT NULL DEFAULT '',
            visitor CHAR(12) NOT NULL DEFAULT '',
            INDEX idx_created (created_at),
            INDEX idx_level (level)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

const LOG_RETENTION_DAYS = 90;

/**
 * Records what the backend did, for the "Activity log" tab on /leads.
 * Never pass names, emails or messages as $detail: only form names, field
 * names, lead numbers and error reasons. The visitor is stored as a short
 * one-way code of their IP, enough to spot repeats without keeping the IP.
 * Warnings and errors also go to the PHP error log, so they are kept even
 * when the database is down.
 *
 * @param 'info'|'warning'|'error' $level
 */
function log_event(string $level, string $event, string $detail = ''): void
{
    $source = basename((string) ($_SERVER['SCRIPT_NAME'] ?? 'php'), '.php');
    if ($level !== 'info') {
        error_log("[{$source}] {$level} {$event}" . ($detail !== '' ? ": {$detail}" : ''));
    }
    if (!db_configured(api_config())) {
        return;
    }
    try {
        $visitor = substr(hash('sha256', 'stellacu-log|' . client_ip()), 0, 12);
        db()->prepare(
            'INSERT INTO activity_log (created_at, level, event, source, detail, visitor)
             VALUES (UTC_TIMESTAMP(), :level, :event, :source, :detail, :visitor)'
        )->execute([
            'level' => $level,
            'event' => substr($event, 0, 50),
            'source' => substr($source, 0, 30),
            'detail' => mb_substr($detail, 0, 500),
            'visitor' => $visitor,
        ]);
        // Now and then, drop entries older than the retention period.
        if (random_int(1, 50) === 1) {
            db()->exec('DELETE FROM activity_log WHERE created_at < UTC_TIMESTAMP() - INTERVAL ' . LOG_RETENTION_DAYS . ' DAY');
        }
    } catch (Throwable $e) {
        error_log('[db] could not write activity log: ' . $e->getMessage());
    }
}

/** Saves an enquiry; returns its id, or null if the database is not set up or unavailable. */
function db_save_lead(string $formKey, array $form, array $values, string $page): ?int
{
    if (!db_configured(api_config())) {
        return null;
    }
    try {
        $budget = isset($values['budget']) && $values['budget'] !== ''
            ? ($form['fields']['budget']['options'][$values['budget']] ?? $values['budget'])
            : '';
        $stmt = db()->prepare(
            'INSERT INTO leads (created_at, form, name, email, phone, company, website, budget, message, page)
             VALUES (UTC_TIMESTAMP(), :form, :name, :email, :phone, :company, :website, :budget, :message, :page)'
        );
        $stmt->execute([
            'form' => $formKey,
            'name' => $values['name'] ?? '',
            'email' => $values['email'] ?? '',
            'phone' => $values['phone'] ?? '',
            'company' => $values['company'] ?? '',
            'website' => $values['website'] ?? '',
            'budget' => $budget,
            'message' => $values['message'] ?? null,
            'page' => $page,
        ]);
        return (int) db()->lastInsertId();
    } catch (Throwable $e) {
        log_event('error', 'lead_not_saved', $e->getMessage());
        return null;
    }
}

/** Saves (or refreshes) a newsletter signup; returns its id or null. */
function db_save_subscriber(string $email, string $page): ?int
{
    if (!db_configured(api_config())) {
        return null;
    }
    try {
        $stmt = db()->prepare(
            "INSERT INTO subscribers (created_at, email, page) VALUES (UTC_TIMESTAMP(), :email, :page)
             ON DUPLICATE KEY UPDATE page = VALUES(page), delivery_status = 'pending', id = LAST_INSERT_ID(id)"
        );
        $stmt->execute(['email' => $email, 'page' => $page]);
        return (int) db()->lastInsertId();
    } catch (Throwable $e) {
        log_event('error', 'subscriber_not_saved', $e->getMessage());
        return null;
    }
}

/** Records whether the email/Mailchimp step worked. */
function db_set_status(string $table, ?int $id, bool $ok): void
{
    if ($id === null) {
        return;
    }
    if (!in_array($table, ['leads', 'subscribers'], true)) {
        return;
    }
    $column = $table === 'leads' ? 'email_status' : 'delivery_status';
    try {
        db()->prepare("UPDATE {$table} SET {$column} = :s WHERE id = :id")->execute(['s' => $ok ? 'sent' : 'failed', 'id' => $id]);
    } catch (Throwable $e) {
        log_event('error', 'status_not_saved', $e->getMessage());
    }
}
